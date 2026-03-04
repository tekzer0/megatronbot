#!/bin/bash
# Reminder checker — runs every minute via cron
# Reads data/reminders.json, fires due reminders via Telegram, removes them

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d'=' -f2-)
REMINDERS_FILE="$SCRIPT_DIR/../data/reminders.json"

[ -f "$REMINDERS_FILE" ] || exit 0

NOW=$(date +%s)

python3 - "$REMINDERS_FILE" "$BOT_TOKEN" "$CHAT_ID" "$NOW" << 'PYEOF'
import json, sys, subprocess

reminders_file = sys.argv[1]
bot_token = sys.argv[2]
chat_id = sys.argv[3]
now = int(sys.argv[4])

try:
    with open(reminders_file) as f:
        reminders = json.load(f)
except Exception:
    sys.exit(0)

remaining = []
fired = 0

for r in reminders:
    if int(r.get('at', 0)) <= now:
        msg = f"\u23f0 Reminder: {r['message']}"
        subprocess.run([
            'curl', '-s', '-X', 'POST',
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            '--data-urlencode', f"chat_id={chat_id}",
            '--data-urlencode', f"text={msg}",
        ], capture_output=True)
        print(f"[remind] Fired: {r['message']}", flush=True)
        fired += 1
    else:
        remaining.append(r)

if fired > 0:
    with open(reminders_file, 'w') as f:
        json.dump(remaining, f, indent=2)
PYEOF
