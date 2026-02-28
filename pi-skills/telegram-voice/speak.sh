#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"text to speak\""
  exit 1
fi

TEXT="$1"

if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  echo "Error: ELEVENLABS_API_KEY is required"
  exit 1
fi

if [ -z "${ELEVENLABS_VOICE_ID:-}" ]; then
  echo "Error: ELEVENLABS_VOICE_ID is required"
  exit 1
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN is required"
  exit 1
fi

if [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "Error: TELEGRAM_CHAT_ID is required"
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

MP3_FILE="$TMP_DIR/voice.mp3"

curl -s -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/$ELEVENLABS_VOICE_ID" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"$TEXT\",\"model_id\":\"eleven_monolingual_v1\"}" \
  --output "$MP3_FILE"

curl -s -X POST \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendVoice" \
  -F "chat_id=$TELEGRAM_CHAT_ID" \
  -F "voice=@$MP3_FILE"

echo "Voice message sent to Telegram"
