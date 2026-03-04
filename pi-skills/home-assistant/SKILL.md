---
name: home-assistant
description: Query and control Home Assistant at 192.168.1.210. Read entity states (lights, sensors, switches, thermostats) and call services to turn things on/off, set values, run automations. Works in command-type cron jobs on the Pi. For agent jobs, use the ha-control webhook bridge at https://megatron.chemical-valley.com/api/ha-control.
---

# Home Assistant

Control and query Home Assistant (192.168.1.210:8123) via the REST API.

## Environment Variables Required

```
HA_URL=http://192.168.1.210:8123
HA_ACCESS_TOKEN=<long-lived-access-token>
```

These are already set in `.env` and available to command-type crons on the Pi.

## Get Entity State(s)

```bash
{baseDir}/ha-state.js                          # All entities (large output)
{baseDir}/ha-state.js light.living_room        # Specific entity
{baseDir}/ha-state.js sensor.cpu_temperature   # Sensor value
{baseDir}/ha-state.js climate.thermostat       # Thermostat state
```

Output format:
```json
{
  "entity_id": "light.living_room",
  "state": "on",
  "attributes": { "brightness": 200, "friendly_name": "Living Room" },
  "last_changed": "2026-02-27T10:00:00Z"
}
```

## Call a Service

```bash
{baseDir}/ha-call.js <domain> <service> [entity_id]
{baseDir}/ha-call.js <domain> <service> [entity_id] --data '{"key":"value"}'
```

### Examples

```bash
# Lights
{baseDir}/ha-call.js light turn_on light.living_room
{baseDir}/ha-call.js light turn_off light.bedroom
{baseDir}/ha-call.js light turn_on light.kitchen --data '{"brightness": 180, "color_temp": 4000}'

# Switches
{baseDir}/ha-call.js switch turn_on switch.fan
{baseDir}/ha-call.js switch turn_off switch.coffee_maker

# Thermostat
{baseDir}/ha-call.js climate set_temperature climate.thermostat --data '{"temperature": 72}'

# Scenes & scripts
{baseDir}/ha-call.js scene turn_on scene.movie_night
{baseDir}/ha-call.js script turn_on script.bedtime_routine

# Automations
{baseDir}/ha-call.js automation trigger automation.morning_routine

# All lights off
{baseDir}/ha-call.js light turn_off all
```

## From Agent Jobs (Docker → Pi bridge)

Agent jobs run on GitHub Actions and cannot reach 192.168.1.210 directly.
Use the webhook bridge instead — it runs the command on the Pi:

```bash
# The agent calls the Pi's public endpoint with x-api-key header
curl -s -X POST https://megatron.chemical-valley.com/api/ha-control \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "light", "service": "turn_on", "entity_id": "light.living_room"}'

# With extra data
curl -s -X POST https://megatron.chemical-valley.com/api/ha-control \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "light", "service": "turn_on", "entity_id": "light.kitchen", "data": {"brightness": 200}}'
```

## Common Entity ID Patterns

- Lights: `light.room_name`
- Switches: `switch.device_name`
- Sensors: `sensor.name` (temperature, humidity, etc.)
- Binary sensors: `binary_sensor.name` (motion, door, etc.)
- Climate: `climate.thermostat`
- Scenes: `scene.scene_name`
- Automations: `automation.automation_name`

To discover all entity IDs: `{baseDir}/ha-state.js | python3 -c "import json,sys; [print(e['entity_id'], '-', e['state']) for e in json.load(sys.stdin)]"`
