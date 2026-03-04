#!/usr/bin/env bash
# install-service.sh — Generate and install megatron-voice.service for this machine.
# Run once after cloning. Re-run if you move the repo or change username.
set -e

VOICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VOICE_USER="$(whoami)"
SERVICE_NAME="megatron-voice"
TEMPLATE="${VOICE_DIR}/megatron-voice.service.template"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "Installing ${SERVICE_NAME}.service"
echo "  User:      ${VOICE_USER}"
echo "  Voice dir: ${VOICE_DIR}"

sed \
  -e "s|VOICE_USER|${VOICE_USER}|g" \
  -e "s|VOICE_DIR|${VOICE_DIR}|g" \
  "${TEMPLATE}" | sudo tee "${SERVICE_FILE}" > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}.service"

echo ""
echo "Done. Start the service with:"
echo "  sudo systemctl start ${SERVICE_NAME}.service"
echo ""
echo "Follow logs with:"
echo "  journalctl -u ${SERVICE_NAME} -f"
