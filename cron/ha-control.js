#!/usr/bin/env node
/**
 * Home Assistant webhook bridge
 * Called by the ha-control trigger when POST /api/ha-control is received.
 * The agent (from GitHub Actions) calls: POST https://megatron.chemical-valley.com/api/ha-control
 * with body: { "domain": "light", "service": "turn_on", "entity_id": "light.living_room" }
 *
 * Optional fields: "data": { "brightness": 200 } for extra service data
 */

const path = require('path');
const fs = require('fs');

// Load .env manually since this runs outside Next.js context
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx);
      const val = trimmed.slice(idx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (_) {}
}

loadEnv();

const HA_URL = process.env.HA_URL || 'http://192.168.1.210:8123';
const HA_TOKEN = process.env.HA_ACCESS_TOKEN;

if (!HA_TOKEN) {
  console.error('HA_ACCESS_TOKEN not set');
  process.exit(1);
}

let body;
try {
  body = JSON.parse(process.argv[2] || '{}');
} catch (e) {
  console.error('Invalid JSON body:', process.argv[2]);
  process.exit(1);
}

const { domain, service, entity_id, data: extraData = {} } = body;

if (!domain || !service) {
  console.error('Body must include "domain" and "service"');
  console.error('Example: {"domain":"light","service":"turn_on","entity_id":"light.living_room"}');
  process.exit(1);
}

const payload = entity_id ? { entity_id, ...extraData } : extraData;

(async () => {
  const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`HA error ${res.status}: ${text}`);
    process.exit(1);
  }

  console.log(`OK: ${domain}.${service}${entity_id ? ' -> ' + entity_id : ''}`);
})();
