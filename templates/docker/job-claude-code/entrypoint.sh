#!/bin/bash
set -e

# Extract job ID from branch name (job/uuid -> uuid), fallback to random UUID
if [[ "$BRANCH" == job/* ]]; then
    JOB_ID="${BRANCH#job/}"
else
    JOB_ID=$(cat /proc/sys/kernel/random/uuid)
fi
echo "Job ID: ${JOB_ID}"

# Export SECRETS (JSON) as flat env vars (GH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, etc.)
if [ -n "$SECRETS" ]; then
    eval $(echo "$SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\(.value | @sh)"')
fi

# Export LLM_SECRETS (JSON) as flat env vars
if [ -n "$LLM_SECRETS" ]; then
    eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\(.value | @sh)"')
fi

# Unset ANTHROPIC_API_KEY so Claude Code uses the OAuth token.
# If both are set, Claude Code prioritizes API key (billing to API credits)
# which defeats the purpose. The API key is for the event handler, not here.
unset ANTHROPIC_API_KEY

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

# Setup logs
LOG_DIR="/job/logs/${JOB_ID}"
mkdir -p "${LOG_DIR}"

# Build system prompt from config MD files
SYSTEM_PROMPT_FILE="${LOG_DIR}/system-prompt.md"
SYSTEM_FILES=("SOUL.md" "AGENT.md")
> "$SYSTEM_PROMPT_FILE"
for i in "${!SYSTEM_FILES[@]}"; do
    cat "/job/config/${SYSTEM_FILES[$i]}" >> "$SYSTEM_PROMPT_FILE"
    if [ "$i" -lt $((${#SYSTEM_FILES[@]} - 1)) ]; then
        echo -e "\n\n" >> "$SYSTEM_PROMPT_FILE"
    fi
done

# Resolve {{datetime}} variable in system prompt
sed -i "s/{{datetime}}/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g" "$SYSTEM_PROMPT_FILE"

# Read job metadata from job.config.json
JOB_CONFIG="/job/logs/${JOB_ID}/job.config.json"
TITLE=$(jq -r '.title // empty' "$JOB_CONFIG")
JOB_DESCRIPTION=$(jq -r '.job // empty' "$JOB_CONFIG")

PROMPT="

# Your Job

${JOB_DESCRIPTION}"

# Run Claude Code — capture exit code instead of letting set -e kill the script
set +e
claude -p "$PROMPT" \
    --append-system-prompt-file "$SYSTEM_PROMPT_FILE" \
    --dangerously-skip-permissions \
    --output-format json \
    > "${LOG_DIR}/claude-session.json" 2>"${LOG_DIR}/claude-stderr.log"
AGENT_EXIT=$?

# Commit based on outcome
if [ $AGENT_EXIT -ne 0 ]; then
    # Claude Code failed — only commit session logs, not partial code changes
    git reset || true
    git add -f "${LOG_DIR}"
    git commit -m "🤖 Agent Job: ${TITLE} (failed)" || true
else
    # Claude Code succeeded — commit everything
    git add -A
    git add -f "${LOG_DIR}"
    git commit -m "🤖 Agent Job: ${TITLE}" || true
fi

git push origin
set -e

# Create PR (auto-merge handled by GitHub Actions workflow)
gh pr create --title "🤖 Agent Job: ${TITLE}" --body "${JOB_DESCRIPTION}" --base main || true

# Re-raise failure so the workflow reports it
if [ $AGENT_EXIT -ne 0 ]; then
    echo "Claude Code exited with code ${AGENT_EXIT}"
    exit $AGENT_EXIT
fi

echo "Done. Job ID: ${JOB_ID}"
