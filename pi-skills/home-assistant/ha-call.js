#!/usr/bin/env node
/**
 * Call a Home Assistant service
 * Usage: ha-call.js <domain> <service> [entity_id] [--data '{"key":"value"}']
 *
 * Examples:
 *   ha-call.js light turn_on light.living_room
 *   ha-call.js light turn_off all
 *   ha-call.js light turn_on light.kitchen --data '{"brightness": 200}'
 *   ha-call.js climate set_temperature climate.thermostat --data '{"temperature": 72}'
 *   ha-call.js scene turn_on scene.movie_night
 */

const HA_URL = process.env.HA_URL || 'http://192.168.1.210:8123';
const HA_TOKEN = process.env.HA_ACCESS_TOKEN;

if (!HA_TOKEN) {
  console.error('HA_ACCESS_TOKEN env var is required');
  process.exit(1);
}

const args = process.argv.slice(2);
const dataIdx = args.indexOf('--data');
const extraData = dataIdx >= 0 ? JSON.parse(args[dataIdx + 1]) : {};

// Remove --data and its value from positional args
const positional = dataIdx >= 0 ? [...args.slice(0, dataIdx), ...args.slice(dataIdx + 2)] : args;
const [domain, service, entityId] = positional;

if (!domain || !service) {
  console.error('Usage: ha-call.js <domain> <service> [entity_id] [--data \'{"key":"val"}\']');
  process.exit(1);
}

const body = entityId ? { entity_id: entityId, ...extraData } : extraData;

const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${HA_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`HA error ${res.status} ${res.statusText}: ${text}`);
  process.exit(1);
}

const result = await res.json();
console.log(`OK: ${domain}.${service}${entityId ? ' -> ' + entityId : ''}`);
if (result?.length) {
  console.log(JSON.stringify(result.map((e) => ({ entity_id: e.entity_id, state: e.state })), null, 2));
}
