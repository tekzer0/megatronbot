# thepopebot

Autonomous AI agents. All the power. None of the leaked API keys.

- 🔐 **Secure by default** — Other frameworks hand credentials to the LLM and hope for the best. thepopebot is different: the AI literally cannot access your secrets, even if it tries.
- 🍴 **The repository IS the agent** — Fork it and you fork everything: code, personality, logs, history.
- 🚀 **GitHub Actions IS the compute** — Free*, isolated containers. Run one task or a thousand in parallel.
- 🧬 **Self-evolving** — The agent modifies its own code through PRs. Every change auditable, every change reversible.

*\*GitHub Actions is free for public repos. Private repos get 2,000 free minutes/month on every plan, including the free tier.*

---

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Using Your Bot](#using-your-bot)
- [Customizing Your Agent](#customizing-your-agent)
- [Configuration](#configuration)
- [Auto-Merge Controls](#auto-merge-controls)
- [Security](#security)
- [Reference](#reference)

---

## Quick Start

### Prerequisites

| Requirement | Install |
|-------------|---------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **npm** or **pnpm** | Included with Node.js |
| **Git** | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** | [cli.github.com](https://cli.github.com) |
| **ngrok*** | [ngrok.com](https://ngrok.com/download) |

*ngrok is only required for local development to expose your local server to the internet. Production deployments (Vercel, Railway, etc.) don't need it.

### Get Started

> **Step 1** — Fork this repository to create your own agent:
>
> [![Fork this repo](https://img.shields.io/badge/Fork_this_repo-238636?style=for-the-badge&logo=github&logoColor=white)](https://github.com/stephengpope/thepopebot/fork)
>
> **Note:** GitHub Actions are disabled by default on forks. You'll need to go to the **Actions** tab in your fork and enable them — nothing runs until you explicitly opt in.

> **Step 1.5** — Make your fork private *(recommended)*:
>
> Your agent repository will contain configuration, logs, and references to API keys. Making it private keeps everything secure.
>
> 1. Go to your forked repository on GitHub
> 2. Click the **Settings** tab
> 3. Scroll down to the **Danger Zone** section
> 4. Click **Change repository visibility**
> 5. Select **Make private** and confirm
>
> ⚠️ *GitHub requires a paid plan (Pro, Team, or Enterprise) to fork into a private repository. If you're on a free plan, you can [duplicate the repo](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository) as a private repository instead of forking.*

**Step 2** — Clone your fork and run the setup wizard:

```bash
git clone https://github.com/YOUR_USERNAME/thepopebot.git
cd thepopebot
npm run setup
```

> **Note:** These instructions are for local testing of the event handler. Production deployment instructions coming soon.

The wizard handles everything:
1. Checks prerequisites (Node.js, Git, GitHub CLI, ngrok)
2. Creates a GitHub Personal Access Token (fine-grained)
3. Collects API keys (Anthropic required; OpenAI, Groq, and [Brave Search](https://api-dashboard.search.brave.com/app/keys) optional — Brave's free tier greatly improves the agent)
4. Sets GitHub repository secrets and variables
5. Sets up Telegram bot
6. Walks you through starting the server + ngrok, generates `event_handler/.env`
7. Registers webhooks and verifies everything works

After setup, message your Telegram bot to create jobs!

---

## How It Works

thepopebot uses a two-layer architecture:

1. **Event Handler** - Node.js server for webhooks, Telegram chat, and cron scheduling
2. **Docker Agent** - Pi coding agent container for autonomous task execution

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  ┌─────────────────┐         ┌─────────────────┐                     │
│  │  Event Handler  │ ──1──►  │     GitHub      │                     │
│  │  (creates job)  │         │ (job/* branch)  │                     │
│  └────────▲────────┘         └────────┬────────┘                     │
│           │                           │                              │
│           │                           2 (triggers run-job.yml)    │
│           │                           │                              │
│           │                           ▼                              │
│           │                  ┌─────────────────┐                     │
│           │                  │  Docker Agent   │                     │
│           │                  │  (runs Pi, PRs) │                     │
│           │                  └────────┬────────┘                     │
│           │                           │                              │
│           │                           3 (creates PR)                 │
│           │                           │                              │
│           │                           ▼                              │
│           │                  ┌─────────────────┐                     │
│           │                  │     GitHub      │                     │
│           │                  │   (PR opened)   │                     │
│           │                  └────────┬────────┘                     │
│           │                           │                              │
│           │                           4a (update-event-handler.yml)  │
│           │                           4b (auto-merge.yml)            │
│           │                           │                              │
│           5 (Telegram notification)   │                              │
│           └───────────────────────────┘                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Using Your Bot

There are currently two ways to trigger jobs — Telegram and webhooks — with more integrations coming soon.

### Telegram Chat

Message your bot directly to chat or create jobs. The bot uses Claude to understand your requests and can:

- **Chat** - Have a conversation, ask questions, get information
- **Create jobs** - Say "create a job to..." and the bot will spawn an autonomous agent

**Security:** During setup, you'll verify your chat ID. Once configured, the bot only responds to messages from your authorized chat and ignores everyone else.

#### Voice Messages

Send voice notes to your bot and they'll be transcribed using OpenAI Whisper.

**Requirements:**
- `OPENAI_API_KEY` in your `.env` file

The bot automatically detects voice messages and transcribes them before processing.

### Webhooks

Create jobs programmatically via HTTP:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"job": "Update the README with installation instructions"}'
```

### Scheduled Jobs

Define recurring jobs in `operating_system/CRONS.json`:

```json
[
  {
    "name": "daily-check",
    "schedule": "0 9 * * *",
    "job": "Check for dependency updates",
    "enabled": true
  }
]
```

Set `"enabled": true` to activate a scheduled job.

---

## Customizing Your Agent

The `operating_system/` directory is the agent's brain — it defines who the agent is and how it behaves.

| File | Purpose |
|------|---------|
| `SOUL.md` | Agent identity, personality traits, and values |
| `CHATBOT.md` | System prompt for Telegram chat |
| `JOB_SUMMARY.md` | Prompt for summarizing completed jobs |
| `HEARTBEAT.md` | Self-monitoring behavior |
| `CRONS.json` | Scheduled job definitions |
| `TRIGGERS.json` | Webhook trigger definitions |

Each job automatically gets its own `logs/<JOB_ID>/job.md` file created by the event handler. Jobs are created via Telegram chat, webhooks, or cron schedules.

You can also add custom skills for the agent in `.pi/skills/`.

---

## Configuration

### Environment Variables

All environment variables for the Event Handler (set in `event_handler/.env`):

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Authentication key for /webhook endpoint | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `PORT` | Server port (default: 3000) | No |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | For Telegram |
| `TELEGRAM_CHAT_ID` | Restricts bot to this chat only | For security |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation | No |
| `GH_WEBHOOK_SECRET` | Secret for GitHub Actions webhook auth | For notifications |
| `ANTHROPIC_API_KEY` | Claude API key for chat functionality | For chat |
| `OPENAI_API_KEY` | OpenAI key for voice transcription | For voice |
| `EVENT_HANDLER_MODEL` | Claude model for chat (default: claude-sonnet-4) | No |

### GitHub Secrets

Set automatically by the setup wizard:

| Secret | Description | Required |
|--------|-------------|----------|
| `SECRETS` | Base64-encoded JSON with protected credentials | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials | No |
| `GH_WEBHOOK_SECRET` | Random secret for webhook authentication | Yes |

### GitHub Repository Variables

Configure in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GH_WEBHOOK_URL` | Event handler URL (e.g., your ngrok URL) | Yes | — |
| `AUTO_MERGE` | Set to `false` to disable auto-merge of job PRs | No | Enabled |
| `ALLOWED_PATHS` | Comma-separated path prefixes for auto-merge | No | `/logs` |
| `IMAGE_URL` | Docker image path (e.g., `ghcr.io/myorg/mybot`) | No | `stephengpope/thepopebot:latest` |

### ngrok URL Changes

ngrok assigns a new URL each time you restart it (unless you have a paid plan with a static domain). When your ngrok URL changes, run:

```bash
npm run setup-telegram
```

This will verify your server is running, update the GitHub webhook URL, re-register the Telegram webhook, and optionally capture your chat ID for security.

### Manual Telegram Setup (Production)

If you're deploying to a platform where you can't run the setup script (Vercel, Railway, etc.), configure Telegram manually:

1. **Set environment variables** in your platform's dashboard (see `event_handler/.env.example` for reference):
   - `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
   - `TELEGRAM_WEBHOOK_SECRET` - Generate with `openssl rand -hex 32`
   - `TELEGRAM_VERIFICATION` - A verification code like `verify-abc12345`

2. **Deploy and register the webhook:**
   ```bash
   curl -X POST https://your-app.vercel.app/telegram/register \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_API_KEY" \
     -d '{"bot_token": "YOUR_BOT_TOKEN", "webhook_url": "https://your-app.vercel.app/telegram/webhook"}'
   ```
   This registers your webhook with the secret from your env.

3. **Get your chat ID:**
   - Message your bot with your `TELEGRAM_VERIFICATION` code (e.g., `verify-abc12345`)
   - The bot will reply with your chat ID

4. **Set `TELEGRAM_CHAT_ID`:**
   - Add the chat ID to your environment variables
   - Redeploy

Now your bot only responds to your authorized chat.

---

## Auto-Merge Controls

By default, job PRs that only modify files under `logs/` are automatically squash-merged. You can control this behavior with two **GitHub repository variables** (Settings → Secrets and variables → Actions → Variables tab):

### `AUTO_MERGE`

Kill switch for all auto-merging.

| Value | Behavior |
|-------|----------|
| *(unset or any value)* | Auto-merge enabled |
| `false` | Auto-merge disabled — all job PRs stay open for manual review |

### `ALLOWED_PATHS`

Comma-separated path prefixes that the agent is allowed to modify and still get auto-merged. If any changed file falls outside these prefixes, the PR stays open.

| Value | Behavior |
|-------|----------|
| *(unset)* | Defaults to `/logs` — only log files auto-merge |
| `/` | Everything allowed — all job PRs auto-merge |
| `/logs` | Only log changes auto-merge |

Path prefixes are matched from the repo root. A leading `/` is optional (`logs` and `/logs` are equivalent).

**Examples:**

Allow all agent changes to auto-merge (original behavior):
```
AUTO_MERGE = (unset)
ALLOWED_PATHS = /
```

Require manual review for everything:
```
AUTO_MERGE = false
```

Only auto-merge log changes:
```
ALLOWED_PATHS = /logs
```

If a PR is blocked, the workflow logs which files were outside the allowed paths so you can see exactly why.

---

## Security

| What the AI tries | What happens |
|-------------------|--------------|
| `echo $ANTHROPIC_API_KEY` | Empty |
| `echo $GH_TOKEN` | Empty |
| `cat /proc/self/environ` | Secrets missing |
| Claude API calls | ✅ Work normally |
| GitHub CLI commands | ✅ Work normally |

### How Secret Protection Works

1. GitHub passes a single `SECRETS` env var (base64-encoded JSON with all credentials)
2. The entrypoint decodes the JSON and exports each key as an env var
3. Pi starts - SDKs read their env vars (ANTHROPIC_API_KEY, gh CLI uses GH_TOKEN)
4. The `env-sanitizer` extension filters ALL secret keys from bash subprocess env
5. The LLM can't `echo $ANYTHING` - subprocess env is filtered
6. Other extensions still have full `process.env` access

**What's Protected:**

Any key in the `SECRETS` JSON is automatically filtered from the LLM's bash environment. The `SECRETS` variable itself is also filtered.

```bash
# If your SECRETS contains:
{"GH_TOKEN": "...", "ANTHROPIC_API_KEY": "...", "MY_CUSTOM_KEY": "..."}

# Then all of these return empty:
echo $GH_TOKEN           # empty
echo $ANTHROPIC_API_KEY  # empty
echo $MY_CUSTOM_KEY      # empty
```

### LLM-Accessible Secrets

Sometimes you want the LLM to have access to certain credentials - browser logins, skill API keys, or service passwords. Use `LLM_SECRETS` for these.

```bash
# Protected (filtered from LLM)
SECRETS=$(echo -n '{"GH_TOKEN":"ghp_xxx","ANTHROPIC_API_KEY":"sk-ant-xxx"}' | base64)

# Accessible to LLM (not filtered)
LLM_SECRETS=$(echo -n '{"BROWSER_PASSWORD":"mypass123"}' | base64)
```

| Credential Type | Put In | Why |
|-----------------|--------|-----|
| `GH_TOKEN` | `SECRETS` | Agent shouldn't push to arbitrary repos |
| `ANTHROPIC_API_KEY` | `SECRETS` | Agent shouldn't leak billing keys |
| Browser login password | `LLM_SECRETS` | Skills may need to authenticate |
| Third-party API key for a skill | `LLM_SECRETS` | Skills need these to function |

### Implementation

The `env-sanitizer` extension in `.pi/extensions/` dynamically filters secrets:

```typescript
const bashTool = createBashTool(process.cwd(), {
  spawnHook: ({ command, cwd, env }) => {
    const filteredEnv = { ...env };
    if (process.env.SECRETS) {
      try {
        for (const key of Object.keys(JSON.parse(process.env.SECRETS))) {
          delete filteredEnv[key];
        }
      } catch {}
    }
    delete filteredEnv.SECRETS;
    return { command, cwd, env: filteredEnv };
  },
});
```

No special Docker flags required. Works on any host.

### Custom Extensions

The env-sanitizer protects against the **AI agent** accessing secrets through bash. Extension code itself can access `process.env` directly - this is by design.

**Best practices:**
- Don't create tools that echo environment variables to the agent
- Review extension code before adding to your agent

---

## Reference

### File Structure

```
/
├── .github/workflows/
│   ├── auto-merge.yml   # Auto-merges job PRs (checks AUTO_MERGE + ALLOWED_PATHS)
│   ├── run-job.yml      # Runs Docker agent on job/* branch creation
│   └── update-event-handler.yml      # Notifies event handler on PR opened
├── .pi/
│   ├── extensions/         # Pi extensions (env-sanitizer for secret filtering)
│   └── skills/             # Custom skills for the agent
├── docs/                   # Additional documentation
├── event_handler/          # Event Handler orchestration layer
│   ├── server.js           # Express HTTP server
│   ├── cron.js             # Cron scheduler
│   ├── cron/               # Working directory for command-type cron jobs
│   ├── .env                # Environment config (generated by setup)
│   ├── claude/             # Claude API integration
│   └── tools/              # Job creation, GitHub, Telegram utilities
├── operating_system/
│   ├── SOUL.md             # Agent identity and personality
│   ├── CHATBOT.md          # Telegram chat system prompt
│   ├── JOB_SUMMARY.md      # Job summary prompt
│   ├── HEARTBEAT.md        # Self-monitoring
│   └── CRONS.json          # Scheduled jobs
├── setup/                  # Interactive setup wizard
│   ├── setup.mjs           # Main wizard script
│   └── lib/                # Helper modules
├── logs/                   # Per-job directories (job.md + session logs)
├── Dockerfile              # Container definition
├── entrypoint.sh           # Startup script
└── SECURITY.md             # Security documentation
```

### API Endpoints

| Endpoint | Method | API_KEY | Purpose |
|----------|--------|---------|---------|
| `/ping` | GET | Y | Health check, returns `{"message": "Pong!"}` |
| `/webhook` | POST | Y | Generic webhook for job creation |
| `/telegram/webhook` | POST | N | Telegram bot webhook (uses its own auth) |
| `/telegram/register` | POST | Y | Register Telegram webhook URL |
| `/github/webhook` | POST | N | Receives notifications from GitHub Actions |
| `/jobs/status` | GET | Y | Check status of a running job |

**Examples:**

Create a job via webhook

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"job": "Update the README with installation instructions"}'
```

Check job status

```bash
curl "http://localhost:3000/jobs/status?job_id=abc123" \
  -H "x-api-key: YOUR_API_KEY"
```

Register Telegram webhook

```bash
curl -X POST http://localhost:3000/telegram/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "bot_token": "YOUR_BOT_TOKEN",
    "webhook_url": "https://your-ngrok-url.ngrok-free.dev/telegram/webhook"
  }'
```

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `run-job.yml` | `job/*` branch created | Runs Docker agent container |
| `update-event-handler.yml` | PR opened from `job/*` branch | Gathers job data (job.md, logs, changed files) and sends to event handler → Telegram |
| `auto-merge.yml` | PR opened from `job/*` branch | Checks `AUTO_MERGE` + `ALLOWED_PATHS`, merges if allowed |

**Flow:**
1. Event handler creates a `job/uuid` branch via GitHub API
2. GitHub Actions detects branch creation → runs `run-job.yml`
3. Docker agent executes task, commits results, creates PR
4. GitHub Actions detects PR opened → runs in parallel:
   - `update-event-handler.yml` → gathers job data → sends to event handler → Telegram
   - `auto-merge.yml` → checks merge policy → squash merges (or leaves open)

### Docker Agent

The container executes tasks autonomously using the Pi coding agent.

**Container includes:**
- Node.js 22
- Pi coding agent
- Puppeteer + Chromium (headless browser, CDP port 9222)
- Git + GitHub CLI

**Environment Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `REPO_URL` | Your repository URL | Yes |
| `BRANCH` | Branch to work on (e.g., job/uuid) | Yes |
| `SECRETS` | Base64-encoded JSON with protected credentials | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials | No |

**Runtime Flow:**
1. Extract Job ID from branch name
2. Start Chrome in headless mode
3. Decode and export secrets (filtered from LLM's bash)
4. Decode and export LLM secrets (accessible to LLM)
5. Configure Git credentials
6. Clone repository branch
7. Run Pi with SOUL.md + job.md
8. Commit all changes
9. Create PR (auto-merge handled by `auto-merge.yml` workflow)

### Session Logs

Each job gets its own directory at `logs/{JOB_ID}/` containing both the job description (`job.md`) and session logs (`.jsonl`). These can be used to resume sessions or review agent actions.
