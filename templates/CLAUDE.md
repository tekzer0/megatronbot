# My Agent

## What is this?

This is an autonomous AI agent powered by [thepopebot](https://github.com/stephengpope/thepopebot). It features a two-layer architecture: a Next.js Event Handler for orchestration (webhooks, Telegram chat, cron scheduling) and a Docker Agent for autonomous task execution.

## Directory Structure

```
/
├── .github/workflows/          # CI/CD workflows (managed by thepopebot)
├── .pi/skills/                 # Custom Pi agent skills
├── config/                     # Agent configuration
│   ├── SOUL.md                 # Agent personality and identity
│   ├── CHATBOT.md              # Telegram chat system prompt
│   ├── JOB_SUMMARY.md          # Job completion summary prompt
│   ├── HEARTBEAT.md            # Periodic check instructions
│   ├── AGENT.md                # Agent runtime environment
│   ├── CRONS.json              # Scheduled job definitions
│   └── TRIGGERS.json           # Webhook trigger definitions
├── app/                        # Next.js app directory
│   ├── layout.js               # Root layout
│   ├── page.js                 # Home page
│   └── api/[...thepopebot]/    # Framework API routes
├── docker/
│   ├── Dockerfile              # Agent container (customizable)
│   └── entrypoint.sh           # Container startup script
├── cron/                       # Working dir for command-type cron actions
├── triggers/                   # Working dir for command-type trigger actions
├── logs/                       # Per-job directories (job.md + session logs)
├── tmp/                        # Temporary files (gitignored)
├── next.config.mjs             # Next.js config with thepopebot wrapper
├── .env                        # API keys and tokens (gitignored)
└── package.json                # Dependencies
```

## Customization

- **config/** — Agent personality, prompts, crons, triggers
- **.pi/skills/** — Custom Pi agent skills
- **cron/** and **triggers/** — Shell scripts for command-type actions
- **app/** — Add Next.js pages, API routes, components

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx thepopebot init` | Scaffold or update the project — creates missing files, reports drifted templates |
| `npx thepopebot diff [file]` | Show differences between your files and package templates |
| `npx thepopebot reset [file]` | Restore a file (or directory) to the package default |
| `npm run setup` | Run interactive setup wizard (API keys, GitHub secrets, Telegram bot) |
| `npm run setup-telegram` | Reconfigure Telegram webhook only |

### Updating thepopebot

When the package is updated via `npm update thepopebot`, template changes are **not** applied automatically — your customizations are preserved. To check for updates:

1. `npm update thepopebot` — updates the package
2. `npx thepopebot init` — reports which templates have drifted (does not overwrite)
3. `npx thepopebot diff <file>` — review what changed
4. `npx thepopebot reset <file>` — accept the new template, or manually merge

## API Endpoints

All API routes are under `/api/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/create-job` | POST | Create a new job (requires API_KEY) |
| `/api/telegram/webhook` | POST | Telegram bot webhook |
| `/api/telegram/register` | POST | Register Telegram webhook URL |
| `/api/github/webhook` | POST | Receives notifications from GitHub Actions |
| `/api/jobs/status` | GET | Check status of a running job |
| `/api/ping` | GET | Health check |
