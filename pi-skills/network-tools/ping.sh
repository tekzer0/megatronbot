#!/bin/bash
# Ping a host and report result
# Usage: ping.sh <host> [count]

HOST="${1:?Usage: ping.sh <host> [count]}"
COUNT="${2:-4}"

echo "Pinging $HOST ($COUNT packets)..."
if ping -c "$COUNT" -W 2 "$HOST"; then
  echo "Result: REACHABLE"
else
  echo "Result: UNREACHABLE"
  exit 1
fi
