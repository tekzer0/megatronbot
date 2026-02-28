#!/bin/bash
set -e

# Extract job ID from branch name (job/uuid -> uuid), fallback to random UUID
if [[ "$BRANCH" == job/* ]]; then
    JOB_ID="${BRANCH#job/}"
else
    JOB_ID=$(cat /proc/sys/kernel/random/uuid)
fi
echo "Job ID: ${JOB_ID}"

# Export SECRETS (JSON) as flat env vars (GH_TOKEN, ANTHROPIC_API_KEY, etc.)
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

# Install npm deps for active skills (native deps need correct Linux arch)
for skill_dir in /job/skills/active/*/; do
    if [ -f "${skill_dir}package.json" ]; then
        echo "Installing skill deps: $(basename "$skill_dir")"
        (cd "$skill_dir" && npm install --omit=dev --no-package-lock)
    fi
done

# Start Chrome if available (installed by browser-tools skill via Puppeteer)
CHROME_PID=""
CHROME_BIN=$(find /root/.cache/puppeteer -name "chrome" -type f 2>/dev/null | head -1)
if [ -n "$CHROME_BIN" ]; then
    $CHROME_BIN --headless --no-sandbox --disable-gpu --remote-debugging-port=9222 2>/dev/null &
    CHROME_PID=$!
    sleep 2
fi

# Setup logs
LOG_DIR="/job/logs/${JOB_ID}"
mkdir -p "${LOG_DIR}"

# Build CLAUDE.md from config MD files (SOUL.md + AGENT.md)
# Claude Code reads CLAUDE.md automatically from the project root
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

# Read job metadata from job.config.json
JOB_CONFIG="/job/logs/${JOB_ID}/job.config.json"
TITLE=$(jq -r '.title // empty' "$JOB_CONFIG")
JOB_DESCRIPTION=$(jq -r '.job // empty' "$JOB_CONFIG")

PROMPT="

# Your Job

${JOB_DESCRIPTION}"

LLM_PROVIDER="${LLM_PROVIDER:-anthropic}"

MODEL_FLAGS="--provider $LLM_PROVIDER"
if [ -n "$LLM_MODEL" ]; then
    MODEL_FLAGS="$MODEL_FLAGS --model $LLM_MODEL"
fi

# Generate models.json for custom provider (OpenAI-compatible endpoints like Ollama)
if [ "$LLM_PROVIDER" = "custom" ] && [ -n "$OPENAI_BASE_URL" ]; then
    # If no API key was provided, set a dummy so Pi doesn't send empty auth
    if [ -z "$CUSTOM_API_KEY" ]; then
        export CUSTOM_API_KEY="not-needed"
    fi
    cat > /root/.pi/agent/models.json <<MODELS
{
  "providers": {
    "custom": {
      "baseUrl": "$OPENAI_BASE_URL",
      "api": "openai-completions",
      "apiKey": "CUSTOM_API_KEY",
      "models": [{ "id": "$LLM_MODEL" }]
    }
  }
}
MODELS
fi

# Copy custom models.json to PI's global config if present in repo (overrides generated)
if [ -f "/job/.pi/agent/models.json" ]; then
    mkdir -p /root/.pi/agent
    cp /job/.pi/agent/models.json /root/.pi/agent/models.json
fi

# Run Claude Code — capture exit code instead of letting set -e kill the script
set +e
claude --print "$PROMPT" 2>&1 | tee "${LOG_DIR}/session.log"
CLAUDE_EXIT=${PIPESTATUS[0]}

# Commit based on outcome
if [ $CLAUDE_EXIT -ne 0 ]; then
    # Claude failed — only commit session logs, not partial code changes
    git reset || true
    git add -f "${LOG_DIR}"
    git commit -m "🤖 Agent Job: ${TITLE} (failed)" || true
else
    # Claude succeeded — commit everything
    git add -A
    git add -f "${LOG_DIR}"
    git commit -m "🤖 Agent Job: ${TITLE}" || true
fi

git push origin
set -e

# 3. Merge (pi has memory of job via session)
#if [ -n "$REPO_URL" ] && [ -f "/job/MERGE_JOB.md" ]; then
#    echo "MERGED"
#    pi -p "$(cat /job/MERGE_JOB.md)" --session-dir "${LOG_DIR}" --continue
#fi

# 5. Create PR (auto-merge handled by GitHub Actions workflow)
gh pr create --title "🤖 Agent Job: ${TITLE}" --body "${JOB_DESCRIPTION}" --base main || true

# Re-raise Claude's failure so the workflow reports it
if [ $CLAUDE_EXIT -ne 0 ]; then
    echo "Claude exited with code ${CLAUDE_EXIT}"
    exit $CLAUDE_EXIT
fi

echo "Done. Job ID: ${JOB_ID}"
