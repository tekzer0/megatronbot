# thepopebot — Package Source Reference

Technical reference for AI assistants modifying the thepopebot NPM package source code.

**Architecture**: Event Handler (Next.js) creates `job/*` branches → GitHub Actions runs Docker agent (Pi) → task executed → PR created → auto-merge → notification. Agent jobs log to `logs/{JOB_ID}/`.

## Package vs. Templates — Where Code Goes

All event handler logic, API routes, library code, and core functionality lives in the **npm package** (`api/`, `lib/`, `config/`, `bin/`). This is what users import when they `import ... from 'thepopebot/...'`.

The `templates/` directory contains **only files that get scaffolded into user projects** via `npx thepopebot init`. Templates are for user-editable configuration and thin wiring — things users are expected to customize or override. Never add core logic to templates.

**When adding or modifying event handler code, always put it in the package itself (e.g., `api/`, `lib/`), not in `templates/`.** Templates should only contain:
- Configuration files users edit (`config/SOUL.md`, `config/CRONS.json`, etc.)
- Thin Next.js wiring (`next.config.mjs`, `instrumentation.js`, catch-all route)
- GitHub Actions workflows
- Docker files
- CLAUDE.md files for AI assistant context in user projects

## Directory Structure

```
/
├── api/
│   └── index.js                # GET/POST handlers for all /api/* routes
├── lib/
│   ├── actions.js              # Shared action executor (agent, command, webhook)
│   ├── cron.js                 # Cron scheduler (loads CRONS.json)
│   ├── triggers.js             # Webhook trigger middleware (loads TRIGGERS.json)
│   ├── paths.js                # Central path resolver (resolves from user's project root)
│   ├── ai/                     # LLM integration (chat, streaming, agent, model, tools)
│   ├── auth/                   # NextAuth config, helpers, middleware, server actions
│   ├── channels/               # Channel adapters (base class, Telegram, factory)
│   ├── chat/                   # Chat route handler, server actions, React UI components
│   ├── db/                     # SQLite via Drizzle (schema, migrations, api-keys)
│   ├── tools/                  # Job creation, GitHub API, Telegram, OpenAI Whisper
│   └── utils/
│       └── render-md.js        # Markdown {{include}} processor
├── config/
│   ├── index.js                # withThepopebot() Next.js config wrapper
│   └── instrumentation.js      # Server startup hook (loads .env, starts crons)
├── bin/
│   └── cli.js                  # CLI entry point
├── setup/                      # Interactive setup wizard
├── templates/                  # Scaffolded to user projects (see rule above)
├── docs/                       # Extended documentation
└── package.json
```

## Key Files

| File | Purpose |
|------|---------|
| `api/index.js` | Next.js GET/POST route handlers for all `/api/*` endpoints |
| `lib/paths.js` | Central path resolver — all paths resolve from user's `process.cwd()` |
| `lib/actions.js` | Shared action dispatcher for agent/command/webhook actions |
| `lib/cron.js` | Cron scheduler — loads `config/CRONS.json` at server start |
| `lib/triggers.js` | Trigger middleware — loads `config/TRIGGERS.json` |
| `lib/utils/render-md.js` | Markdown include and variable processor (`{{filepath}}`, `{{datetime}}`, `{{skills}}`) |
| `config/index.js` | `withThepopebot()` Next.js config wrapper |
| `config/instrumentation.js` | `register()` startup hook (loads .env, validates AUTH_SECRET, init DB, starts crons) |
| `bin/cli.js` | CLI entry point (`thepopebot init`, `setup`, `reset`, `diff`, etc.) |
| `lib/ai/index.js` | Chat, streaming, and job summary functions |
| `lib/ai/agent.js` | LangGraph agent with SQLite checkpointing and tool use |
| `lib/channels/base.js` | Channel adapter base class (normalize messages across platforms) |
| `lib/db/index.js` | Database initialization — SQLite via Drizzle ORM |
| `lib/db/api-keys.js` | API key management (SHA-256 hashed, timing-safe verify) |

## NPM Package Exports

| Import | Module | Purpose |
|--------|--------|---------|
| `thepopebot/api` | `api/index.js` | `GET` and `POST` route handlers — re-exported by the user's catch-all route |
| `thepopebot/config` | `config/index.js` | `withThepopebot()` — wraps the user's Next.js config to mark server-only packages as external |
| `thepopebot/instrumentation` | `config/instrumentation.js` | `register()` — Next.js instrumentation hook that loads `.env` and starts cron jobs on server start |
| `thepopebot/auth` | `lib/auth/index.js` | Auth helpers (`auth()`, `getPageAuthState()`) |
| `thepopebot/auth/actions` | `lib/auth/actions.js` | Server action for admin setup (`setupAdmin()`) |
| `thepopebot/chat` | `lib/chat/components/index.js` | Chat UI components |
| `thepopebot/chat/actions` | `lib/chat/actions.js` | Server actions for chats, notifications, and swarm |
| `thepopebot/chat/api` | `lib/chat/api.js` | Dedicated chat streaming route handler (session auth) |
| `thepopebot/db` | `lib/db/index.js` | Database access |
| `thepopebot/middleware` | `lib/auth/middleware.js` | Auth middleware |

### Column Naming Convention

Drizzle schema uses camelCase JS property names mapped to snake_case SQL columns.
Example: `createdAt: integer('created_at')` — use `createdAt` in JS, SQL column is `created_at`.

## Database

SQLite via Drizzle ORM at `data/thepopebot.sqlite` (override with `DATABASE_PATH`). Auto-initialized on server start.

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts (email, bcrypt password hash, role) |
| `chats` | Chat sessions (user_id, title, timestamps) |
| `messages` | Chat messages (chat_id, role, content) |
| `notifications` | Job completion notifications |
| `subscriptions` | Channel subscriptions |
| `settings` | Key-value configuration store (also stores API keys) |

### Migration Rules

**All schema changes MUST go through the migration workflow.**

- **NEVER** write raw `CREATE TABLE`, `ALTER TABLE`, or any DDL SQL manually
- **NEVER** modify `initDatabase()` to add schema changes
- **ALWAYS** make schema changes by editing `lib/db/schema.js` then running `npm run db:generate`

**Workflow**: Edit `lib/db/schema.js` → `npm run db:generate` → review generated SQL in `drizzle/` → commit both schema change and migration file. Migrations auto-apply on startup via `migrate()` in `initDatabase()`.

**Key files**: `lib/db/schema.js` (source of truth), `drizzle/` (generated migrations), `drizzle.config.js` (Drizzle Kit config), `lib/db/index.js` (`initDatabase()` calls `migrate()`).

## Security: /api vs Server Actions

**`/api` routes are for external callers only.** They authenticate via `x-api-key` header or webhook secrets (Telegram, GitHub). Never add session/cookie auth to `/api` routes.

**Browser UI uses Server Actions.** All authenticated browser-to-server calls MUST use Next.js Server Actions (`'use server'` functions in `lib/chat/actions.js` or `lib/auth/actions.js`), not `/api` fetch calls. Server Actions use the `requireAuth()` pattern which validates the session cookie internally.

**Exception: chat streaming.** The AI SDK's `DefaultChatTransport` requires an HTTP endpoint. Chat has its own route handler at `lib/chat/api.js` (mapped to `/stream/chat`) with session auth, outside `/api`.

| Caller | Mechanism | Auth | Location |
|--------|-----------|------|----------|
| External (cURL, GitHub Actions, Telegram) | `/api` route handler | `x-api-key` or webhook secret | `api/index.js` |
| Browser UI (data/mutations) | Server Action | `requireAuth()` session check | `lib/chat/actions.js`, `lib/auth/actions.js` |
| Browser UI (chat streaming) | Dedicated route handler | `auth()` session check | `lib/chat/api.js` |

## Action Dispatch System

Both cron jobs and webhook triggers use the same shared dispatch system (`lib/actions.js`). Every action has a `type` field — `"agent"` (default), `"command"`, or `"webhook"`.

| | `agent` | `command` | `webhook` |
|---|---------|-----------|-----------|
| **Uses LLM** | Yes — spins up Pi in a Docker container | No — runs a shell command | No — makes an HTTP request |
| **Runtime** | Minutes to hours | Milliseconds to seconds | Milliseconds to seconds |
| **Cost** | LLM API calls + GitHub Actions minutes | Free (runs on event handler) | Free (runs on event handler) |

If the task needs to *think*, use `agent`. If it just needs to *do*, use `command`. If it needs to *call an external service*, use `webhook`.

**Agent**: Creates a Docker Agent job via `createJob()`. Pushes a `job/*` branch; `run-job.yml` spins up the container. The `job` string is the LLM task prompt.

**Command**: Runs a shell command on the event handler. Working directory: `cron/` for crons, `triggers/` for triggers.

**Webhook**: Makes an HTTP request. `GET` skips the body; `POST` (default) sends `{ ...vars }` or `{ ...vars, data: <payload> }`.

| Webhook field | Required | Default | Description |
|---------------|----------|---------|-------------|
| `url` | yes | — | Target URL |
| `method` | no | `"POST"` | `"GET"` or `"POST"` |
| `headers` | no | `{}` | Outgoing request headers |
| `vars` | no | `{}` | Key-value pairs merged into outgoing body |

### Cron Jobs

Defined in `config/CRONS.json`, loaded by `lib/cron.js` at startup via `node-cron`. Each entry has `name`, `schedule` (cron expression), `type` (`agent`/`command`/`webhook`), and the corresponding action fields (`job`, `command`, or `url`/`method`/`headers`/`vars`). Set `enabled: false` to disable. Agent-type entries support optional `llm_provider` and `llm_model` fields to override the default LLM (passed to Docker agent via `job.config.json`).

### Webhook Triggers

Defined in `config/TRIGGERS.json`, loaded by `lib/triggers.js`. Each trigger watches an endpoint path (`watch_path`) and fires an array of actions (fire-and-forget, after auth, before route handler). Actions use the same `type`/`job`/`command`/`url` fields as cron jobs, including optional `llm_provider`/`llm_model` overrides. Template tokens in `job` and `command` strings: `{{body}}`, `{{body.field}}`, `{{query}}`, `{{query.field}}`, `{{headers}}`, `{{headers.field}}`.

## Markdown File Includes

Markdown files in `config/` support includes and built-in variables, powered by `lib/utils/render-md.js`.

- **File includes**: `{{ filepath.md }}` — resolves relative to project root, recursive with circular detection. Missing files are left as-is.
- **`{{datetime}}`** — Current ISO timestamp.
- **`{{skills}}`** — Dynamic bullet list of active skill descriptions from `skills/active/*/SKILL.md` frontmatter (resolved via `.pi/skills` symlink). Never hardcode skill names — this is resolved at runtime.

Currently used by the Event Handler to load EVENT_HANDLER.md as the LLM system prompt.

## Authentication

NextAuth v5 with Credentials provider (email/password), JWT in httpOnly cookies. First visit creates admin account. `requireAuth()` validates sessions in server actions. API routes use `x-api-key` header. `AUTH_SECRET` env var required for session encryption.

## Config Variable Architecture

`LLM_MODEL` and `LLM_PROVIDER` exist in two separate systems using the same names:

- **`.env`** — read by the event handler (chat). Set by `setup/lib/sync.mjs`.
- **GitHub repository variables** — read by `run-job.yml` (agent jobs). Set by `setup/lib/sync.mjs`.

These are independent environments. They use the same variable names. They can hold different values (e.g. chat uses sonnet, jobs use opus). Do NOT create separate `AGENT_LLM_*` variable names — just set different values in `.env` vs GitHub variables.
