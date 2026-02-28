#!/bin/bash
set -e

# Extract job ID from branch name (job/uuid -> uuid), fallback to random UUID
if [[ "$BRANCH" == job/* ]]; then
    JOB_ID="${BRANCH#job/}"
else
    JOB_ID=$(cat /proc/sys/kernel/random/uuid)
fi
echo "Job ID: ${JOB_ID}"

# Export SECRETS (JSON) as flat env vars (GH_TOKEN, GROQ_API_KEY, etc.)
# These are filtered from LLM's bash subprocess by env-sanitizer extension
if [ -n "$SECRETS" ]; then
    eval $(echo "$SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\(.value | @sh)"')
fi

# Export LLM_SECRETS (JSON) as flat env vars
# These are NOT filtered - LLM can access these (browser logins, skill API keys, etc.)
if [ -n "$LLM_SECRETS" ]; then
    eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\(.value | @sh)"')
fi

# Git setup - derive identity from GitHub token
gh auth setup-git
GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "\(.id)+\(.login)@users.noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# Clone branch
if [ -n "$REPO_URL" ]; then
    git clone --single-branch --branch "$BRANCH" --depth 1 "$REPO_URL" /job
else
    echo "No REPO_URL provided"
fi

cd /job

# Create temp directory for agent use (gitignored via tmp/)
mkdir -p /job/tmp

# Setup logs
LOG_DIR="/job/logs/${JOB_ID}"
mkdir -p "${LOG_DIR}"

# Build CLAUDE.md from config MD files (SOUL.md + AGENT.md)
CLAUDE_MD="/job/CLAUDE.md"
> "$CLAUDE_MD"
for cfg_file in SOUL.md AGENT.md; do
    cfg_path="/job/config/${cfg_file}"
    if [ -f "$cfg_path" ]; then
        cat "$cfg_path" >> "$CLAUDE_MD"
        echo -e "\n\n" >> "$CLAUDE_MD"
    fi
done

# Resolve {{datetime}} in CLAUDE.md
sed -i "s/{{datetime}}/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g" "$CLAUDE_MD"

PROMPT="$(cat /job/logs/${JOB_ID}/job.md)"

# Build aider model string: groq/<model>
AIDER_MODEL="groq/${LLM_MODEL:-moonshotai/kimi-k2-instruct}"
echo "Using model: ${AIDER_MODEL}"

# Run aider — capture exit code instead of letting set -e kill the script
set +e
aider \
  --model "$AIDER_MODEL" \
  --message "$PROMPT" \
  --yes-always \
  --no-auto-commits \
  --read CLAUDE.md \
  2>&1 | tee "${LOG_DIR}/session.log"
AGENT_EXIT=${PIPESTATUS[0]}

# Commit based on outcome
if [ $AGENT_EXIT -ne 0 ]; then
    # Agent failed — only commit session logs, not partial code changes
    git reset || true
    git add -f "${LOG_DIR}"
    git commit -m "megatronbot: job ${JOB_ID} (failed)" || true
else
    # Agent succeeded — commit everything
    git add -A
    git add -f "${LOG_DIR}"
    git commit -m "megatronbot: job ${JOB_ID}" || true
fi

git push origin
set -e

# Create PR (auto-merge handled by GitHub Actions workflow)
gh pr create --title "megatronbot: job ${JOB_ID}" --body "Automated job" --base main || true

# Re-raise agent's failure so the workflow reports it
if [ $AGENT_EXIT -ne 0 ]; then
    echo "Agent exited with code ${AGENT_EXIT}"
    exit $AGENT_EXIT
fi

echo "Done. Job ID: ${JOB_ID}"
