#!/bin/bash
# Self-healing monitor — checks PM2 processes and systemd services
# Runs every 5 min via cron. Sends Telegram alert if anything needed restarting.

export PATH="$PATH:/home/tekzer0/.npm-global/bin:/usr/local/bin"

ENV_FILE="$(dirname "$0")/../.env"
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d'=' -f2-)

FIXED=()

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=$1" \
    -d "parse_mode=Markdown" > /dev/null
}

# Check PM2 processes
for proc in thepopebot cloudflared; do
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    procs = json.load(sys.stdin)
    p = next((p for p in procs if p['name'] == '$proc'), None)
    print(p['pm2_env']['status'] if p else 'missing')
except:
    print('unknown')
" 2>/dev/null)

  if [ "$STATUS" != "online" ]; then
    pm2 restart "$proc" 2>/dev/null || true
    FIXED+=("PM2: \`$proc\` was *$STATUS*, restarted")
  fi
done

# Check minitower-oled systemd service
if ! systemctl is-active --quiet minitower-oled.service 2>/dev/null; then
  sudo systemctl restart minitower-oled.service 2>/dev/null || \
    systemctl restart minitower-oled.service 2>/dev/null || true
  FIXED+=("systemd: \`minitower-oled\` was down, restarted")
fi

# Send alert if anything was fixed
if [ ${#FIXED[@]} -gt 0 ]; then
  MSG="⚠️ *Self-Heal Alert* (Oracle1)"$'\n'
  for item in "${FIXED[@]}"; do
    MSG+="• $item"$'\n'
  done
  send_telegram "$MSG"
fi
