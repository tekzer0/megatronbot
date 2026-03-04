#!/bin/bash
# System resource monitor — sends Telegram alert if thresholds exceeded
# Runs every 10 min via cron.

ENV_FILE="$(dirname "$0")/../.env"
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d'=' -f2-)

DISK_WARN=80
RAM_WARN=85
CPU_WARN=90

ALERTS=()

# Disk usage on /
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/, ""); print $5}')
if [ "$DISK_PCT" -gt "$DISK_WARN" ]; then
  ALERTS+=("Disk: ${DISK_PCT}% used (threshold: ${DISK_WARN}%)")
fi

# RAM usage
RAM_PCT=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$RAM_PCT" -gt "$RAM_WARN" ]; then
  ALERTS+=("RAM: ${RAM_PCT}% used (threshold: ${RAM_WARN}%)")
fi

# CPU load vs core count
CORES=$(nproc)
CPU_LOAD=$(awk '{print $1}' /proc/loadavg)
CPU_PCT=$(echo "$CPU_LOAD $CORES" | awk '{printf "%.0f", ($1/$2)*100}')
if [ "$CPU_PCT" -gt "$CPU_WARN" ]; then
  ALERTS+=("CPU: ${CPU_PCT}% load (threshold: ${CPU_WARN}%)")
fi

if [ ${#ALERTS[@]} -gt 0 ]; then
  MSG="🔴 *System Alert* (Oracle1)"$'\n'
  for item in "${ALERTS[@]}"; do
    MSG+="• $item"$'\n'
  done
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=$MSG" \
    -d "parse_mode=Markdown" > /dev/null
fi
