# Configuration

## Environment Variables

All environment variables for the Event Handler (set in `.env` in your project root):

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Authentication key for `/api/create-job` and other protected endpoints | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | For Telegram |
| `TELEGRAM_CHAT_ID` | Restricts bot to this chat only | For security |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation | No |
| `TELEGRAM_VERIFICATION` | Verification code for getting your chat ID | For Telegram setup |
| `GH_WEBHOOK_SECRET` | Secret for GitHub Actions webhook auth | For notifications |
| `LLM_PROVIDER` | LLM provider: `anthropic`, `openai`, or `google` (default: `anthropic`) | No |
| `LLM_MODEL` | LLM model name override (provider-specific default if unset) | No |
| `ANTHROPIC_API_KEY` | API key for Anthropic provider | For anthropic provider |
| `OPENAI_API_KEY` | API key for OpenAI provider / Whisper voice transcription | For openai provider or voice |
| `GOOGLE_API_KEY` | API key for Google provider | For google provider |

---

## GitHub Secrets

Set automatically by the setup wizard:

| Secret | Description | Required |
|--------|-------------|----------|
| `SECRETS` | Base64-encoded JSON with protected credentials | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials | No |
| `GH_WEBHOOK_SECRET` | Random secret for webhook authentication | Yes |

---

## GitHub Repository Variables

Configure in **Settings → Secrets and variables → Actions → Variables**:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GH_WEBHOOK_URL` | Event handler URL (e.g., your ngrok URL) | Yes | — |
| `AUTO_MERGE` | Set to `false` to disable auto-merge of job PRs | No | Enabled |
| `ALLOWED_PATHS` | Comma-separated path prefixes for auto-merge | No | `/logs` |
| `DOCKER_IMAGE_URL` | Docker image path (e.g., `ghcr.io/myorg/mybot`) | No | `stephengpope/thepopebot:latest` |
| `LLM_PROVIDER` | LLM provider (`anthropic`, `openai`, `google`) | No | `anthropic` |
| `LLM_MODEL` | LLM model name for the Pi agent | No | Provider default |

---

## ngrok URL Changes

ngrok assigns a new URL each time you restart it (unless you have a paid plan with a static domain). When your ngrok URL changes, run:

```bash
npm run setup-telegram
```

This will verify your server is running, update the GitHub webhook URL, re-register the Telegram webhook, and optionally capture your chat ID for security.

---

## Manual Telegram Setup (Production)

If you're deploying to a platform where you can't run the setup script (Vercel, Railway, etc.), configure Telegram manually:

1. **Set environment variables** in your platform's dashboard (see `.env.example` for reference):
   - `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
   - `TELEGRAM_WEBHOOK_SECRET` - Generate with `openssl rand -hex 32`
   - `TELEGRAM_VERIFICATION` - A verification code like `verify-abc12345`

2. **Deploy and register the webhook:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/telegram/register \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_API_KEY" \
     -d '{"bot_token": "YOUR_BOT_TOKEN", "webhook_url": "https://your-app.vercel.app/api/telegram/webhook"}'
   ```
   This registers your webhook with the secret from your env.

3. **Get your chat ID:**
   - Message your bot with your `TELEGRAM_VERIFICATION` code (e.g., `verify-abc12345`)
   - The bot will reply with your chat ID

4. **Set `TELEGRAM_CHAT_ID`:**
   - Add the chat ID to your environment variables
   - Redeploy

Now your bot only responds to your authorized chat.
