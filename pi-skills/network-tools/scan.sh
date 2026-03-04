#!/bin/bash
# Discover active hosts on the local network
# Usage: scan.sh [subnet]

SUBNET="${1:-192.168.1.0/24}"
echo "=== Network Scan: $SUBNET ==="
echo ""

if command -v nmap &>/dev/null; then
  echo "Using nmap..."
  nmap -sn "$SUBNET" 2>/dev/null | grep -E "Nmap scan report|Host is up|MAC Address"
else
  echo "nmap not found — using ping sweep (slow). Install nmap: sudo apt install nmap"
  echo ""
  BASE=$(echo "$SUBNET" | cut -d'/' -f1 | cut -d'.' -f1-3)
  FOUND=0
  for i in $(seq 1 254); do
    ip="$BASE.$i"
    if ping -c 1 -W 0.3 "$ip" &>/dev/null; then
      echo "  UP: $ip"
      FOUND=$((FOUND + 1))
    fi
  done
  echo ""
  echo "$FOUND host(s) found"
fi
