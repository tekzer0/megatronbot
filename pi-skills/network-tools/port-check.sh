#!/bin/bash
# Check if a specific port is open on a host
# Usage: port-check.sh <host> <port>

HOST="${1:?Usage: port-check.sh <host> <port>}"
PORT="${2:?Usage: port-check.sh <host> <port>}"

if nc -z -w 3 "$HOST" "$PORT" 2>/dev/null; then
  echo "✓ $HOST:$PORT is OPEN"
else
  echo "✗ $HOST:$PORT is CLOSED or UNREACHABLE"
  exit 1
fi
