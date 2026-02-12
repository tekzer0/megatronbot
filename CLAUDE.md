# thepopebot - AI Agent NPM Package

This document explains the thepopebot codebase for AI assistants working on this package.

## What is thepopebot?

thepopebot is an **NPM package** for creating custom autonomous AI agents. Users install it via `npx thepopebot init`, which scaffolds a Next.js project. It features a two-layer architecture: a Next.js Event Handler for orchestration (webhooks, Telegram chat, cron scheduling) and a Docker Agent for autonomous task execution via the Pi coding agent.

## Two-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          thepopebot Architecture                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐                                                   │
│   │  Event Handler   │                                                   │
│   │  ┌────────────┐  │         1. create-job                            │
│   │  │  Telegram  │  │ ─────────────────────────►  ┌──────────────────┐ │
│   │  │   Cron     │  │                             │      GitHub      │ │
│   │  │   Chat     │  │ ◄─────────────────────────  │  (job/* branch)  │ │
│   │  └────────────┘  │   5. update-event-handler.yml calls   └────────┬─────────┘ │
│   │                  │      /api/github/webhook               │           │
│   └──────────────────┘                                      │           │
│            │                                                │           │
│            │                           2. run-job.yml    │           │
│            ▼                              triggers          │           │
│   ┌──────────────────┐                                      │           │
│   │ Telegram notifies│                                      ▼           │
│   │ user of job done │                         ┌──────────────────────┐ │
│   └──────────────────┘                         │    Docker Agent      │ │
│                                                │  ┌────────────────┐  │ │
│                                                │  │ 1. Clone       │  │ │
│                                                │  │ 2. Run Pi      │  │ │
│                                                │  │ 3. Commit      │  │ │
│                                                │  │ 4. Create PR   │  │ │
│                                                │  └────────────────┘  │ │
│                                                └──────────┬───────────┘ │
│                                                           │             │
│                                                           │ 3. PR opens │
│                                                           ▼             │
│                                                ┌──────────────────────┐ │
│                                                │       GitHub         │ │
│                                                │    (PR opened)       │ │
│                                                │                      │ │
│                                                │ 4. auto-merge.yml    │ │
│                                                │    (waits for merge  │ │
│                                                │     check, merges)   │ │
│                                                │          │           │ │
│                                                │          ▼           │ │
│                                                │ 5. update-event-     │ │
│                                                │    handler.yml       │ │
│                                                │    (notifies after   │ │
│                                                │     auto-merge done) │ │
│                                                └──────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
/
├── api/                        # Next.js route handlers (exported as thepopebot/api)
│   └── index.js                # GET/POST handlers for all /api/* routes
├── lib/                        # Core implementation
│   ├── actions.js              # Shared action executor (agent, command, http)
│   ├── cron.js                 # Cron scheduler (loads CRONS.json)
│   ├── triggers.js             # Webhook trigger middleware (loads TRIGGERS.json)
│   ├── paths.js                # Central path resolver (resolves from user's project root)
│   ├── claude/
│   │   ├── index.js            # Claude API integration for chat
│   │   ├── tools.js            # Tool definitions (create_job, get_job_status)
│   │   └── conversation.js     # Chat history management
│   ├── tools/
│   │   ├── create-job.js       # Job creation via GitHub API
│   │   ├── github.js           # GitHub REST API helper + job status
│   │   ├── telegram.js         # Telegram bot integration
│   │   └── openai.js           # OpenAI Whisper transcription
│   └── utils/
│       └── render-md.js        # Markdown {{include}} processor
├── config/
│   ├── index.js                # withThepopebot() Next.js config wrapper
│   └── instrumentation.js      # Server startup hook (loads .env, starts crons)
├── bin/
│   └── cli.js                  # CLI: init, setup, setup-telegram, reset, diff
├── setup/                      # Interactive setup wizard
│   ├── setup.mjs               # Main wizard script
│   ├── setup-telegram.mjs      # Telegram-only reconfiguration
│   └── lib/                    # Wizard helpers (prerequisites, github, auth, prompts, telegram)
├── templates/                  # Files scaffolded to user projects by `thepopebot init`
│   ├── CLAUDE.md               # User project AI assistant guide
│   ├── .env.example
│   ├── .gitignore
│   ├── next.config.mjs
│   ├── instrumentation.js
│   ├── app/                    # Next.js app (layout, page, catch-all API route)
│   ├── .github/workflows/      # GitHub Actions (auto-merge, docker-build, run-job, update-event-handler)
│   ├── .pi/                    # Pi extensions + skills
│   ├── docker/                 # Dockerfile + entrypoint (scaffolded for custom builds)
│   └── config/                 # Agent config (SOUL, CHATBOT, CRONS, TRIGGERS, etc.)
├── docs/                       # Extended documentation
└── package.json                # NPM package definition
```

## Key Files

| File | Purpose |
|------|---------|
| `api/index.js` | Next.js GET/POST route handlers for all `/api/*` endpoints |
| `lib/paths.js` | Central path resolver — all paths resolve from user's `process.cwd()` |
| `lib/actions.js` | Shared action dispatcher for agent/command/http actions |
| `lib/cron.js` | Cron scheduler — loads `config/CRONS.json` at server start |
| `lib/triggers.js` | Trigger middleware — loads `config/TRIGGERS.json` |
| `lib/utils/render-md.js` | Markdown `{{filepath}}` include processor |
| `config/index.js` | `withThepopebot()` Next.js config wrapper |
| `config/instrumentation.js` | `register()` server startup hook (loads .env, starts crons) |
| `bin/cli.js` | CLI entry point (`thepopebot init`, `setup`, `reset`, `diff`) |
| `templates/docker/Dockerfile` | Builds the agent container (Node.js 22, Playwright, Pi) — scaffolded to user projects |
| `templates/docker/entrypoint.sh` | Container startup — clones repo, runs agent, commits results — scaffolded to user projects |

## NPM Package Exports

The package exposes three entry points:

| Import | Module | Purpose |
|--------|--------|---------|
| `thepopebot/api` | `api/index.js` | `GET` and `POST` route handlers — re-exported by the user's catch-all route |
| `thepopebot/config` | `config/index.js` | `withThepopebot()` — wraps the user's Next.js config to mark server-only packages as external |
| `thepopebot/instrumentation` | `config/instrumentation.js` | `register()` — Next.js instrumentation hook that loads `.env` and starts cron jobs on server start |

## CLI Commands

| Command | Description |
|---------|-------------|
| `thepopebot init` | Scaffold a new project — copies templates, creates `package.json`, runs `npm install` |
| `thepopebot setup` | Run interactive setup wizard (API keys, GitHub secrets, Telegram bot) |
| `thepopebot setup-telegram` | Reconfigure Telegram webhook only |
| `thepopebot reset [file]` | Restore a template file to package default (or list all available templates) |
| `thepopebot diff [file]` | Show differences between project files and package templates |

### `thepopebot init`

Scaffolds (or updates) a project. For each file in `templates/`:
- **Missing** — creates the file
- **Identical** — silently skips
- **Different** — skips the file but records it as changed

After copying, if any files differ from the package templates, `init` prints a summary:

```
Updated templates available:
These files differ from the current package templates.
This may be from your edits, or from a thepopebot update.

  config/CRONS.json
  .github/workflows/run-job.yml

To view differences:  npx thepopebot diff <file>
To reset to default:  npx thepopebot reset <file>
```

This is also how users discover template changes after running `npm update thepopebot` — re-run `npx thepopebot init` and it reports which templates have drifted. New template files are created automatically; existing files are never overwritten.

### `thepopebot diff [file]`

Without arguments, lists all files that differ from package templates. With a file path, shows a colored `git diff` between the user's file and the package template.

```bash
npx thepopebot diff                    # list all drifted files
npx thepopebot diff config/SOUL.md     # show diff for a specific file
```

### `thepopebot reset [file]`

Without arguments, lists all available template files. With a file path, overwrites the user's file with the package default. Also works on directories.

```bash
npx thepopebot reset                   # list all template files
npx thepopebot reset config/SOUL.md    # restore a single file
npx thepopebot reset config            # restore entire config/ directory
```

### Template Update Workflow

When thepopebot is updated via npm, template changes are **not** applied automatically — the user's customizations are preserved. The workflow is:

1. `npm update thepopebot` — updates the package (templates change inside `node_modules`)
2. `npx thepopebot init` — detects drifted templates and lists them (does not overwrite)
3. `npx thepopebot diff <file>` — review what changed
4. `npx thepopebot reset <file>` — accept the new template, or manually merge the changes

## How User Projects Work

When a user runs `npx thepopebot init`, the CLI scaffolds a Next.js project that wires into the package:

1. **`next.config.mjs`** imports `withThepopebot` from `thepopebot/config` — marks server-only dependencies as external so they aren't bundled for the client
2. **`instrumentation.js`** re-exports `register` from `thepopebot/instrumentation` — Next.js calls this on server start to load `.env` and start cron jobs
3. **`app/api/[...thepopebot]/route.js`** re-exports `GET` and `POST` from `thepopebot/api` — catch-all route that handles all `/api/*` requests

The user's project contains only configuration files (`config/`, `.env`, `.github/workflows/`) and the thin Next.js wiring. All core logic lives in the npm package.

## Event Handler Layer

The Event Handler is a Next.js API route handler (`api/index.js`) that provides orchestration capabilities:

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhook` | POST | Generic webhook for job creation (requires API_KEY) |
| `/api/telegram/webhook` | POST | Telegram bot webhook for conversational interface |
| `/api/telegram/register` | POST | Register Telegram webhook URL |
| `/api/github/webhook` | POST | Receives notifications from GitHub Actions (update-event-handler.yml) |
| `/api/jobs/status` | GET | Check status of a running job |
| `/api/ping` | GET | Health check |

### Components

- **`api/index.js`** — Next.js route handlers (GET/POST) with auth and trigger middleware
- **`lib/cron.js`** — Loads CRONS.json and schedules jobs using node-cron
- **`lib/triggers.js`** — Loads TRIGGERS.json and fires actions when watched paths are hit
- **`lib/claude/`** — Claude API integration for Telegram chat with tool use
- **`lib/tools/`** — Job creation, GitHub API, Telegram, and OpenAI utilities

### Action Types: `agent`, `command`, and `http`

Both cron jobs and webhook triggers use the same shared dispatch system (`lib/actions.js`). Every action has a `type` field — `"agent"` (default), `"command"`, or `"http"`.

#### Choosing Between `agent`, `command`, and `http`

| | `agent` | `command` | `http` |
|---|---------|-----------|--------|
| **Uses LLM** | Yes — spins up Pi in a Docker container | No — runs a shell command directly | No — makes an HTTP request |
| **Thinking** | Can reason, make decisions, write code | No thinking, just executes | No thinking, just sends a request |
| **Runtime** | Minutes to hours (full agent lifecycle) | Milliseconds to seconds | Milliseconds to seconds |
| **Cost** | LLM API calls + GitHub Actions minutes | Free (runs on event handler) | Free (runs on event handler) |

If the task needs to *think*, use `agent`. If it just needs to *do*, use `command`. If it needs to *call an external service*, use `http`.

#### Type: `agent` (default)

Creates a full Docker Agent job via `createJob()`. This pushes a `job/*` branch to GitHub, which triggers `run-job.yml` to spin up the Docker container with Pi. The `job` string is passed directly as-is to the LLM as its task prompt (written to `logs/<JOB_ID>/job.md` on the job branch).

**Best practice:** Keep the `job` field short. Put detailed task instructions in a dedicated markdown file in `config/` and reference it by path:

```json
"job": "Read the file at config/MY_TASK.md and complete the tasks described there."
```

This keeps config files clean and makes instructions easier to read and edit. Avoid writing long multi-line job descriptions inline.

#### Type: `command`

Runs a shell command directly on the event handler server. No Docker container, no GitHub branch, no LLM. Each system has its own working directory for scripts (in the user's project root):
- **Crons**: `cron/`
- **Triggers**: `triggers/`

#### Type: `http`

Makes an HTTP request to an external URL. No Docker container, no LLM. Useful for forwarding webhooks, calling external APIs, or pinging health endpoints.

**Outgoing body logic:**
- `GET` requests skip the body entirely
- `POST` (default) sends `{ ...vars }` if no incoming data, or `{ ...vars, data: <incoming payload> }` when triggered by a webhook

**Cron example** (no incoming data — just makes a scheduled request):
```json
{
  "name": "ping-status",
  "schedule": "*/5 * * * *",
  "type": "http",
  "url": "https://example.com/status",
  "method": "POST",
  "vars": { "source": "heartbeat" }
}
```
Sends: `{ "source": "heartbeat" }`

**Trigger example** (forwards incoming payload):
```json
{
  "name": "forward-github",
  "watch_path": "/github/webhook",
  "actions": [
    { "type": "http", "url": "https://example.com/hook", "vars": { "source": "github" } }
  ]
}
```
Sends: `{ "source": "github", "data": { ...req.body... } }`

**`http` action fields:**

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | yes | — | Target URL |
| `method` | no | `"POST"` | `"GET"` or `"POST"` |
| `headers` | no | `{}` | Outgoing request headers |
| `vars` | no | `{}` | Extra key/value pairs merged into outgoing body |

### Cron Jobs

Cron jobs are defined in `config/CRONS.json` and loaded by `lib/cron.js` at server startup (via the instrumentation hook) using `node-cron`.

#### Examples

```json
{
  "name": "heartbeat",
  "schedule": "*/30 * * * *",
  "type": "agent",
  "job": "Read the file at config/HEARTBEAT.md and complete the tasks described there.",
  "enabled": true
}
```

```json
{
  "name": "ping",
  "schedule": "*/1 * * * *",
  "type": "command",
  "command": "echo \"pong!\"",
  "enabled": true
}
```

#### Fields

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Display name for logging | Yes |
| `schedule` | Cron expression (e.g., `*/30 * * * *`) | Yes |
| `type` | `agent` (default), `command`, or `http` | No |
| `job` | Task description for agent type | For `agent` |
| `command` | Shell command for command type | For `command` |
| `url` | Target URL for http type | For `http` |
| `method` | HTTP method (`GET` or `POST`, default: `POST`) | No |
| `headers` | Outgoing request headers | No |
| `vars` | Extra key/value pairs merged into outgoing body | No |
| `enabled` | Set to `false` to disable without deleting | No |

### Webhook Triggers

Webhook triggers are defined in `config/TRIGGERS.json` and loaded by `lib/triggers.js`. They fire actions when existing endpoints are hit. Triggers fire **after auth passes, before the route handler runs**, and are fire-and-forget (they don't block the request).

#### Example

```json
[
  {
    "name": "on-github-event",
    "watch_path": "/github/webhook",
    "actions": [
      { "type": "command", "command": "echo 'github webhook fired'" },
      { "type": "agent", "job": "A github event occurred. Review the payload:\n{{body}}" }
    ],
    "enabled": true
  }
]
```

#### Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | — | Display name for logging |
| `watch_path` | yes | — | Existing endpoint path to watch (e.g., `/github/webhook`) |
| `actions` | yes | — | Array of actions (each uses `type`/`job`/`command` per action types above) |
| `actions[].type` | no | `"agent"` | `"agent"`, `"command"`, or `"http"` |
| `actions[].job` | for agent | — | Job description, supports `{{body}}` (full payload) and `{{body.field}}` templates |
| `actions[].command` | for command | — | Shell command, supports `{{body}}` and `{{body.field}}` templates |
| `actions[].url` | for http | — | Target URL |
| `actions[].method` | no | `"POST"` | HTTP method (`"GET"` or `"POST"`) |
| `actions[].headers` | no | `{}` | Outgoing request headers |
| `actions[].vars` | no | `{}` | Extra key/value pairs merged into outgoing body (incoming payload added as `data` field) |
| `enabled` | no | `true` | Set `false` to disable |

#### Template tokens

Both `job` and `command` strings support the same templates:
- `{{body}}` — full request body as JSON
- `{{body.field}}` — a specific field from the body
- `{{query}}` / `{{query.field}}` — query string params
- `{{headers}}` / `{{headers.field}}` — request headers

### Environment Variables (Event Handler)

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Authentication key for /api/webhook endpoint | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | For Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for validating Telegram webhooks | No |
| `TELEGRAM_VERIFICATION` | Verification code for getting chat ID | For Telegram setup |
| `TELEGRAM_CHAT_ID` | Default Telegram chat ID for notifications | For Telegram |
| `GH_WEBHOOK_SECRET` | Secret for GitHub Actions webhook auth | For notifications |
| `ANTHROPIC_API_KEY` | Claude API key for chat functionality | For chat |
| `OPENAI_API_KEY` | OpenAI API key for Whisper voice transcription | For voice messages |
| `EVENT_HANDLER_MODEL` | Claude model for chat (default: claude-sonnet-4) | No |

## Docker Agent Layer

The Dockerfile (`templates/docker/Dockerfile`, scaffolded to `docker/Dockerfile` in user projects) creates a container with:
- **Node.js 22** (Bookworm slim)
- **Pi coding agent** (`@mariozechner/pi-coding-agent`)
- **Playwright + Chromium** (headless browser automation)
- **Git + GitHub CLI** (for repository operations)

### Runtime Flow (entrypoint.sh)

1. Extract Job ID from branch name (job/uuid → uuid) or generate UUID
2. Start headless Chrome (CDP on port 9222)
3. Decode `SECRETS` from base64, parse JSON, export each key as env var (filtered from LLM's bash)
4. Decode `LLM_SECRETS` from base64, parse JSON, export each key as env var (LLM can access these)
5. Configure Git credentials via `gh auth setup-git` (uses GH_TOKEN from SECRETS)
6. Clone repository branch to `/job`
7. Run Pi with SOUL.md + job.md as prompt
8. Save session log to `logs/{JOB_ID}/`
9. Commit all changes with message `thepopebot: job {JOB_ID}`
10. Create PR via `gh pr create` (auto-merge handled by `auto-merge.yml` workflow)

### Environment Variables (Docker Agent)

| Variable | Description | Required |
|----------|-------------|----------|
| `REPO_URL` | Git repository URL to clone | Yes |
| `BRANCH` | Branch to clone and work on (e.g., job/uuid) | Yes |
| `SECRETS` | Base64-encoded JSON with protected credentials (GH_TOKEN, ANTHROPIC_API_KEY, etc.) - filtered from LLM | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with credentials the LLM can access (browser logins, skill API keys) | No |

## GitHub Actions

GitHub Actions are scaffolded into the user's project (from `templates/.github/workflows/`) and automate the job lifecycle. No manual webhook configuration needed.

### docker-build.yml

Triggers on push to `main`. Builds the Docker image and pushes it to GitHub Container Registry (GHCR). Only runs when `IMAGE_URL` is set to a GHCR URL (starts with `ghcr.io/`). Non-GHCR URLs skip this workflow entirely.

```yaml
on:
  push:
    branches: [main]
# Only runs if: vars.IMAGE_URL is set AND starts with "ghcr.io/"
# Pushes to: {IMAGE_URL}:latest
```

### run-job.yml

Triggers when a `job/*` branch is created. Runs the Docker agent container. If `IMAGE_URL` is set, pulls from that registry (logs into GHCR automatically for `ghcr.io/` URLs); otherwise falls back to `stephengpope/thepopebot:latest` from Docker Hub.

```yaml
on:
  create:
# Only runs if: branch name starts with "job/"
```

### update-event-handler.yml

Triggers after `auto-merge.yml` completes (via `workflow_run`), not in parallel. Checks out the PR branch, gathers all job data (job.md, commit message, changed files, session log), and sends a fat payload to the event handler including the `merge_result` (`success`/`failure`). The event handler then summarizes via Claude and sends a Telegram notification — no additional GitHub API calls needed.

```yaml
on:
  workflow_run:
    workflows: ["Auto-Merge Job PR"]
    types: [completed]
# Only runs if: head branch starts with "job/"
# Includes merge_result in payload (from auto-merge conclusion)
```

### auto-merge.yml

Triggers when a PR is opened from a `job/*` branch. First waits for GitHub to compute mergeability (polls every 10s, up to 30 attempts). Then checks two repository variables before merging:

1. **`AUTO_MERGE`** — If set to `"false"`, skip merge entirely. Any other value (or unset) means auto-merge is enabled.
2. **`ALLOWED_PATHS`** — Comma-separated path prefixes (e.g., `/logs`). Only merges if all changed files fall within allowed prefixes. Defaults to `/logs` if unset.

If the PR is mergeable and both checks pass, merges the PR with `--squash`. If there's a merge conflict, the merge is skipped and the PR stays open for manual review. After this workflow completes, `update-event-handler.yml` fires to send the notification.

```yaml
on:
  pull_request:
    types: [opened]
    branches: [main]
# Only runs if: PR head branch starts with "job/"
# Waits for mergeability before attempting merge
# Uses automatic GITHUB_TOKEN — no additional secrets needed
```

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `SECRETS` | Base64-encoded JSON with protected credentials (GH_TOKEN, ANTHROPIC_API_KEY, etc.) |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials (optional) |
| `GH_WEBHOOK_SECRET` | Secret to authenticate with event handler |

### GitHub Repository Variables

Configure these in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description | Default |
|----------|-------------|---------|
| `GH_WEBHOOK_URL` | Event handler URL (e.g., `https://your-server.com`) | — |
| `AUTO_MERGE` | Set to `false` to disable auto-merge of job PRs | Enabled (any value except `false`) |
| `ALLOWED_PATHS` | Comma-separated path prefixes (e.g., `/logs`). Use `/` for all paths. | `/logs` |
| `IMAGE_URL` | Full Docker image path (e.g., `ghcr.io/myorg/mybot`). GHCR URLs trigger automatic builds via `docker-build.yml`. Non-GHCR URLs (e.g., `docker.io/user/mybot`) are pulled directly. | Not set (uses `stephengpope/thepopebot:latest`) |
| `MODEL` | Anthropic model ID for the Pi agent (e.g., `claude-sonnet-4-5-20250929`) | Not set (Pi default) |

## How Credentials Work

Credentials are passed via base64-encoded JSON in the `SECRETS` environment variable:

```bash
# Encode credentials
SECRETS=$(echo -n '{"GH_TOKEN":"ghp_xxx","ANTHROPIC_API_KEY":"sk-ant-xxx"}' | base64)
```

At runtime, entrypoint.sh decodes and exports each key as a flat environment variable. The `env-sanitizer` extension filters these from the LLM's bash subprocess, so the agent can't `echo $ANTHROPIC_API_KEY`.

For credentials the LLM needs access to (browser logins, skill API keys), use `LLM_SECRETS` instead - these are NOT filtered.

## Customization Points

Users create their agent project with:

```bash
mkdir my-agent && cd my-agent
npx thepopebot init
npm run setup
```

The setup wizard handles API keys, GitHub secrets/variables, and Telegram bot configuration. Users customize their agent by editing:

1. **config/SOUL.md** - Agent personality and identity
2. **config/CHATBOT.md** - Telegram chat system prompt
3. **config/CRONS.json** - Scheduled job definitions
4. **config/TRIGGERS.json** - Webhook trigger definitions
5. **.pi/skills/** - Custom skills for the agent
6. **cron/** and **triggers/** - Shell scripts for command-type actions

## The Operating System

These files in `config/` define the agent's character and behavior (scaffolded from `templates/config/`):

- **SOUL.md** - Personality, identity, and values (who the agent is)
- **CHATBOT.md** - System prompt for Telegram chat
- **JOB_SUMMARY.md** - Prompt for summarizing completed jobs
- **HEARTBEAT.md** - Self-monitoring behavior
- **AGENT.md** - Agent runtime environment
- **CRONS.json** - Scheduled job definitions
- **TRIGGERS.json** - Webhook trigger definitions

## Session Logs

Each job gets its own directory at `logs/{JOB_ID}/` containing both the job description (`job.md`) and session logs (`.jsonl`). This directory can be used to resume sessions for follow-up tasks via the `--session-dir` flag.

## Markdown File Includes

Markdown files in `config/` support a `{{filepath}}` include syntax, powered by `lib/utils/render-md.js`.

- **Syntax**: `{{ filepath }}` — double curly braces around a file path
- **Path resolution**: Paths resolve relative to the user's project root (`process.cwd()`)
- **Recursive**: Included files can themselves contain includes
- **Circular protection**: If a circular include is detected, it is skipped and a warning is logged
- **Missing files**: If a referenced file doesn't exist, the pattern is left as-is

Currently used by the Event Handler to load CHATBOT.md (which includes CLAUDE.md) as the Claude system prompt.
