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
│           │                           4b (update-event-handler.yml)  │
│           │                           │                              │
│           5 (Telegram notification)   │                              │
│           └───────────────────────────┘                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

You talk to your bot on Telegram (or hit a webhook). The Event Handler creates a job branch. GitHub Actions spins up a Docker container with the Pi coding agent. The agent does the work, commits the results, and opens a PR. Auto-merge handles the rest. You get a Telegram notification when it's done.

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
| **ngrok*** | [ngrok.com](https://ngrok.com/download) |

*\*ngrok is only required for local development. Production deployments don't need it.*

### Three steps

**Step 1** — Scaffold a new project:

```bash
mkdir my-agent && cd my-agent
npx thepopebot init
```

This creates a Next.js project with configuration files, GitHub Actions workflows, and agent templates. You don't need to create a GitHub repo first — the setup wizard handles that.

**Step 2** — Run the setup wizard:

```bash
npm run setup
```

The wizard walks you through everything:
- Checks prerequisites (Node.js, Git, GitHub CLI, ngrok)
- Creates a GitHub repository and pushes your initial commit
- Creates a GitHub Personal Access Token (scoped to your repo)
- Collects API keys (Anthropic required; OpenAI, Groq, Brave optional)
- Sets GitHub repository secrets and variables
- Sets up a Telegram bot (optional)
- Starts the dev server + ngrok, generates `.env`
- Registers webhooks and verifies everything works

**Step 3** — Start using your agent:

- **Telegram**: Message your bot to create jobs conversationally. Ask it to do tasks, check job status, or just chat.
- **Webhook**: Send a POST to `/api/create-job` with your API key to create jobs programmatically.
- **Cron**: Edit `config/CRONS.json` to schedule recurring jobs.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=stephengpope/thepopebot&type=date&legend=top-left)](https://www.star-history.com/#stephengpope/thepopebot&type=date&legend=top-left)

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

## Updating

When thepopebot is updated via npm, your customizations are always preserved — template changes are never applied automatically. To update:

```bash
npm update thepopebot
npx thepopebot init
```

`init` will report which templates have drifted (new files are created automatically, existing files are never overwritten):

```
Updated templates available:
These files differ from the current package templates.

  config/CRONS.json
  .github/workflows/run-job.yml

To view differences:  npx thepopebot diff <file>
To reset to default:  npx thepopebot reset <file>
```

Review and accept changes at your own pace:

```bash
npx thepopebot diff config/CRONS.json    # see what changed
npx thepopebot reset config/CRONS.json   # accept the new template
```

Or manually merge the changes if you want to keep some of your edits.

---

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Two-layer design, file structure, API endpoints, GitHub Actions, Docker agent |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, GitHub secrets, repo variables, ngrok, Telegram setup |
| [Customization](docs/CUSTOMIZATION.md) | Personality, skills, operating system files, using your bot, security details |
| [Auto-Merge](docs/AUTO_MERGE.md) | Auto-merge controls, ALLOWED_PATHS configuration |
| [How to Use Pi](docs/HOW_TO_USE_PI.md) | Guide to the Pi coding agent |
| [Security](docs/SECURITY_TODO.md) | Security hardening plan |
