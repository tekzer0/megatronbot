#!/bin/bash
# Full connectivity check for Oracle1
# Checks internet, DNS, and all known local services

echo "=== Oracle1 Network Status ==="
echo "Hostname: $(hostname)"
echo "Local IPs: $(hostname -I | tr ' ' '\n' | grep -v '^$' | tr '\n' ' ')"
echo "Date: $(date)"
echo ""

echo "=== Network Interfaces ==="
ip addr show | grep -E "^[0-9]+:|inet " | sed 's/^/  /'
echo ""

echo "=== Internet Connectivity ==="
for host in 8.8.8.8 1.1.1.1; do
  if ping -c 1 -W 2 "$host" &>/dev/null; then
    echo "  ✓ $host (Google/Cloudflare DNS)"
  else
    echo "  ✗ $host UNREACHABLE"
  fi
done

for host in google.com api.groq.com api.telegram.org megatron.chemical-valley.com; do
  if ping -c 1 -W 3 "$host" &>/dev/null; then
    echo "  ✓ $host"
  else
    echo "  ✗ $host (DNS/unreachable)"
  fi
done
echo ""

echo "=== Local Services ==="
declare -A SERVICES
SERVICES["192.168.1.1:80"]="Router"
SERVICES["192.168.1.190:11434"]="Ollama"
SERVICES["192.168.1.195:3000"]="popebot"
SERVICES["192.168.1.210:8123"]="Home Assistant"

for addr in "${!SERVICES[@]}"; do
  label="${SERVICES[$addr]}"
  host="${addr%%:*}"
  port="${addr##*:}"
  if nc -z -w 2 "$host" "$port" 2>/dev/null; then
    echo "  ✓ $addr ($label)"
  else
    echo "  ✗ $addr ($label) — unreachable"
  fi
done
echo ""

echo "=== Default Route ==="
ip route show default | sed 's/^/  /'
