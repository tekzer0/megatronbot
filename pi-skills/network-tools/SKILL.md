---
name: network-tools
description: Network diagnostics for Oracle1 (Pi 5). Check connectivity, ping hosts, scan the local network, and inspect port availability. Use these to troubleshoot network issues or verify services are reachable.
---

# Network Tools

Diagnostic utilities for checking Oracle1's network status and connectivity.

## Connectivity Check

```bash
{baseDir}/check.sh
```

Checks internet connectivity, known local hosts (Ollama, popebot, Home Assistant), and shows current IP/interfaces. Run this first when troubleshooting network issues.

## Ping

```bash
{baseDir}/ping.sh <host> [count]
```

Examples:
```bash
{baseDir}/ping.sh 8.8.8.8
{baseDir}/ping.sh 192.168.1.210 10
{baseDir}/ping.sh megatron.chemical-valley.com
```

## Port Check

```bash
{baseDir}/port-check.sh <host> <port>
```

Check if a specific port is open:
```bash
{baseDir}/port-check.sh 192.168.1.190 11434   # Ollama
{baseDir}/port-check.sh 192.168.1.210 8123    # Home Assistant
{baseDir}/port-check.sh localhost 3000         # popebot
```

## Network Scan

```bash
{baseDir}/scan.sh [subnet]
```

Discover active hosts on the local network:
```bash
{baseDir}/scan.sh                   # Default: 192.168.1.0/24
{baseDir}/scan.sh 192.168.0.0/24   # Custom subnet
```

Note: `nmap` gives much faster results. Install with `sudo apt install nmap` if not present.

## Known Network Layout

| Host | IP | Purpose |
|---|---|---|
| Oracle1 (this Pi) | 192.168.1.195 | popebot server |
| Ollama server | 192.168.1.190 | qwen2.5:7b |
| Home Assistant | 192.168.1.210:8123 | Smart home |
| Router | 192.168.1.1 | Gateway |
