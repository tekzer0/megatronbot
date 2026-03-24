#!/bin/bash
# System resource monitor — sends Telegram alert if thresholds exceeded
# Runs every 10 min via cron. Sends both text and voice via ElevenLabs TTS.

ENV_FILE="$(dirname "$0")/../.env"
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' "$ENV_FILE" | cut -d'=' -f2-)
ELEVENLABS_KEY=$(grep '^ELEVENLABS_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
ELEVENLABS_VOICE=$(grep '^ELEVENLABS_VOICE_ID=' "$ENV_FILE" | cut -d'=' -f2-)
ELEVENLABS_VOICE=${ELEVENLABS_VOICE:-YOq2y2Up4RgXP2HyXjE5}

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
  VOICE_MSG="System alert."
  for item in "${ALERTS[@]}"; do
    MSG+="• $item"$'\n'
    VOICE_MSG+=" $item."
  done

  # Send text message
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=$MSG" \
    -d "parse_mode=Markdown" > /dev/null

  # Send voice message via ElevenLabs TTS (if configured)
  if [ -n "$ELEVENLABS_KEY" ]; then
    AUDIO_FILE=$(mktemp /tmp/alert_XXXXXX.mp3)
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$AUDIO_FILE" \
      -X POST "https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}" \
      -H "xi-api-key: ${ELEVENLABS_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"${VOICE_MSG}\", \"model_id\": \"eleven_flash_v2_5\", \"voice_settings\": {\"stability\": 0.5, \"similarity_boost\": 0.75, \"speed\": 1.15}}")

    if [ "$HTTP_CODE" = "200" ] && [ -s "$AUDIO_FILE" ]; then
      curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendVoice" \
        -F "chat_id=${CHAT_ID}" \
        -F "voice=@${AUDIO_FILE}" > /dev/null
    fi
    rm -f "$AUDIO_FILE"
  fi
fi
