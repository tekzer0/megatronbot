# thepopebot

**Autonomous AI agents. All the power. None of the leaked API keys.**

---

## Why thepopebot?

**Secure by default** — Other frameworks hand credentials to the LLM and hope for the best. thepopebot is different: the AI literally cannot access your secrets, even if it tries. Secrets are filtered at the process level before the agent's shell even starts.

**The repository IS the agent** — Every action your agent takes is a git commit. You can see exactly what it did, when, and why. If it screws up, revert it. Want to clone your agent? Fork the repo — code, personality, scheduled jobs, full history, all of it goes with your fork.

**Free compute, built in** — Every GitHub account comes with free cloud computing time. thepopebot uses that to run your agent. One task or a hundred in parallel — the compute is already included.

**Self-evolving** — The agent modifies its own code through pull requests. Every change is auditable, every change is reversible. You stay in control.

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─────────────────┐         ┌─────────────────┐                     │
│  │  Event Handler  │ ──1──►  │     GitHub      │                     │
│  │  (creates job)  │         │ (job/* branch)  │                     │
│  └────────▲────────┘         └────────┬────────┘                     │
│           │                           │                              │
│           │                           2 (triggers run-job.yml)       │
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
│           │                           4a (auto-merge.yml)            │
│           │                           4b (rebuild-event-handler.yml) │
│           │                           │                              │
│           5 (notify-pr-complete.yml / │                              │
│           │  notify-job-failed.yml)   │                              │
│           └───────────────────────────┘                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

You interact with your bot via the web chat interface or Telegram (optional). The Event Handler creates a job branch. GitHub Actions spins up a Docker container with the Pi coding agent. The agent does the work, commits the results, and opens a PR. Auto-merge handles the rest. You get a notification when it's done.

---

## Get FREE server time on Github!

| | thepopebot | Other platforms |
|---|---|---|
| **Public repos** | Free. $0. GitHub Actions doesn't charge. | $20-100+/month |
| **Private repos** | 2,000 free minutes/month (every GitHub plan, including free) | $20-100+/month |
| **Infrastructure** | GitHub Actions (already included) | Dedicated servers |

You just bring your own [Anthropic API key](https://console.anthropic.com/).

---

## Get Started

### Prerequisites

| Requirement | Install |
|-------------|---------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **npm** | Included with Node.js |
| **Git** | [git-scm.com](https://git-scm.com) |
| **GitHub CLI** | [cli.github.com](https://cli.github.com) |
| **Docker + Docker Compose** | [docker.com](https://docs.docker.com/get-docker/) |
| **ngrok*** | [ngrok.com](https://ngrok.com/download) |

*\*ngrok is only required for local installs without port forwarding. VPS/cloud deployments don't need it.*

### Three steps

**Step 1** — Scaffold a new project:

```bash
mkdir my-agent && cd my-agent
npx thepopebot@latest init
```

This creates a Next.js project with configuration files, GitHub Actions workflows, and agent templates. You don't need to create a GitHub repo first — the setup wizard handles that.

**Step 2** — Run the setup wizard:

```bash
npm run setup
```

The wizard walks you through everything:
- Checks prerequisites (Node.js, Git, GitHub CLI)
- Creates a GitHub repository and pushes your initial commit
- Creates a GitHub Personal Access Token (scoped to your repo)
- Collects API keys (Anthropic required; OpenAI, Brave optional)
- Sets GitHub repository secrets and variables
- Generates `.env`
- Builds the project

**Step 3** — Start your agent:

```bash
docker compose up -d
```

- **Web Chat**: Visit your APP_URL to chat with your agent, create jobs, upload files
- **Telegram** (optional): Run `npm run setup-telegram` to connect a Telegram bot
- **Webhook**: Send a POST to `/api/create-job` with your API key to create jobs programmatically
- **Cron**: Edit `config/CRONS.json` to schedule recurring jobs

> **Local installs**: Your server needs to be reachable from the internet for GitHub webhooks and Telegram. On a VPS/cloud server, your APP_URL is just your domain. For local development, use [ngrok](https://ngrok.com) (`ngrok http 80`) or port forwarding to expose your machine. If your ngrok URL changes, update APP_URL in `.env` and the GitHub repository variable, and re-run `npm run setup-telegram` if Telegram is configured.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=stephengpope/thepopebot&type=date&legend=top-left)](https://www.star-history.com/#stephengpope/thepopebot&type=date&legend=top-left)

---

## Updating

**1. Update the package**

```bash
npm install thepopebot@latest
```

**2. Scaffold and update templates**

```bash
npx thepopebot init
```

For most people, that's it — `init` handles everything. It updates your project files, runs `npm install`, and updates `THEPOPEBOT_VERSION` in your local `.env`.

#### How your project is structured

When you ran `thepopebot init` the first time, it scaffolded a project folder with two kinds of files:

**Your files** — These are yours to customize. `init` will never overwrite them:

| Files | What they do |
|-------|-------------|
| `config/SOUL.md`, `CHATBOT.md`, `AGENT.md`, etc. | Your agent's personality, behavior, and prompts |
| `config/CRONS.json`, `TRIGGERS.json` | Your scheduled jobs and webhook triggers |
| `app/` | Next.js pages and UI components |
| `docker/job/` | The Dockerfile for your agent's job container |

**Managed files** — These are infrastructure files that need to stay in sync with the package version. `init` auto-updates them for you:

| Files | What they do |
|-------|-------------|
| `.github/workflows/` | GitHub Actions that run jobs, auto-merge PRs, rebuild on deploy |
| `docker-compose.yml` | Defines how your containers run together (Traefik, event handler, runner) |
| `docker/event-handler/` | The Dockerfile for the event handler container |
| `.dockerignore` | Keeps unnecessary files out of Docker builds |

#### What happens when you run `init`

1. **Managed files** are updated automatically to match the new package version
2. **Your files** are left alone — but if the package ships new defaults (e.g., a new field in `CRONS.json`), `init` lets you know:

```
Updated templates available:
These files differ from the current package templates.

  config/CRONS.json

To view differences:  npx thepopebot diff <file>
To reset to default:  npx thepopebot reset <file>
```

You can review at your own pace:

```bash
npx thepopebot diff config/CRONS.json    # see what changed
npx thepopebot reset config/CRONS.json   # accept the new template
```

#### If you've modified managed files

If you've made custom changes to managed files (e.g., added extra steps to a GitHub Actions workflow), use `--no-managed` so `init` doesn't overwrite your changes:

```bash
npx thepopebot init --no-managed
```

**3. Rebuild for local dev**

```bash
npm run build
```

**4. Commit and push**

```bash
git add -A && git commit -m "upgrade thepopebot to vX.X.X"
git push
```

Pushing to `main` triggers the `rebuild-event-handler.yml` workflow on your server. It detects the version change, runs `thepopebot init`, updates `THEPOPEBOT_VERSION` in the server's `.env`, pulls the new Docker image, restarts the container, rebuilds `.next`, and reloads PM2 — no manual `docker compose` needed.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx thepopebot init` | Scaffold a new project, or check for updated templates in an existing one |
| `npx thepopebot diff [file]` | List files that differ from package templates, or show the diff for a specific file |
| `npx thepopebot reset [file]` | List all template files, or restore a specific file (or directory) to the package default |
| `npm run setup` | Run the full interactive setup wizard |
| `npm run setup-telegram` | Reconfigure the Telegram webhook (useful when your ngrok URL changes) |

---

## Template File Conventions

The `templates/` directory contains files scaffolded into user projects by `thepopebot init`. Two naming conventions handle files that npm or AI tools would otherwise misinterpret:

**`.template` suffix** — Files ending in `.template` are scaffolded with the suffix stripped. This is used for files that npm mangles (`.gitignore`) or that AI tools would pick up as real project docs (`CLAUDE.md`).

| In `templates/` | Scaffolded as |
|-----------------|---------------|
| `.gitignore.template` | `.gitignore` |
| `CLAUDE.md.template` | `CLAUDE.md` |
| `api/CLAUDE.md.template` | `api/CLAUDE.md` |

**`CLAUDE.md` exclusion** — The scaffolding walker skips any file named `CLAUDE.md` (without the `.template` suffix). This is a safety net so a bare `CLAUDE.md` accidentally added to `templates/` never gets copied into user projects where AI tools would confuse it with real project instructions.

---

## Production Deployment

Deploy your agent to a cloud VPS with HTTPS.

### 1. Server prerequisites

You need a VPS (any provider — Hetzner, DigitalOcean, AWS, etc.) with:

- Docker + Docker Compose
- Node.js 18+
- Git
- GitHub CLI (`gh`)

Point a domain (e.g., `mybot.example.com`) to your server's IP address with a DNS A record.

### 2. Scaffold and configure

SSH into your server and scaffold the project:

```bash
mkdir my-agent && cd my-agent
npx thepopebot@latest init
npm run setup
```

When the setup wizard asks for `APP_URL`, enter your production URL with `https://` (e.g., `https://mybot.example.com`).

Set the `RUNS_ON` GitHub variable so workflows use your server's self-hosted runner instead of GitHub-hosted runners:

```bash
gh variable set RUNS_ON --body "self-hosted" --repo OWNER/REPO
```

### 3. Enable HTTPS (Let's Encrypt)

The `docker-compose.yml` has Let's Encrypt support built in but commented out. Three edits to enable it:

**a) Add your email to `.env`:**

```
LETSENCRYPT_EMAIL=you@example.com
```

**b) Uncomment the TLS lines in the traefik service command:**

```yaml
- --entrypoints.web.http.redirections.entrypoint.to=websecure
- --entrypoints.web.http.redirections.entrypoint.scheme=https
- --certificatesresolvers.letsencrypt.acme.email=${LETSENCRYPT_EMAIL}
- --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
- --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
```

**c) Switch the event-handler labels from HTTP to HTTPS:**

Comment out the HTTP entrypoint and uncomment the two HTTPS lines:

```yaml
# - traefik.http.routers.event-handler.entrypoints=web
- traefik.http.routers.event-handler.entrypoints=websecure
- traefik.http.routers.event-handler.tls.certresolver=letsencrypt
```

### 4. Build and launch

```bash
npm run build
docker compose up -d
```

Ports 80 and 443 must be open on your server. Port 80 is required even with HTTPS — Let's Encrypt uses it for the ACME HTTP challenge to verify domain ownership.

---

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Two-layer design, file structure, API endpoints, GitHub Actions, Docker agent |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, GitHub secrets, repo variables, ngrok, Telegram setup |
| [Customization](docs/CUSTOMIZATION.md) | Personality, skills, operating system files, using your bot, security details |
| [Chat Integrations](docs/CHAT_INTEGRATIONS.md) | Web chat, Telegram, adding new channels |
| [Auto-Merge](docs/AUTO_MERGE.md) | Auto-merge controls, ALLOWED_PATHS configuration |
| [How to Use Pi](docs/HOW_TO_USE_PI.md) | Guide to the Pi coding agent |
