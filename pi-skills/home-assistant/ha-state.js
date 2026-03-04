#!/usr/bin/env node
/**
 * Get Home Assistant entity state(s)
 * Usage: ha-state.js [entity_id]
 *   entity_id omitted → returns all entities (filtered to useful fields)
 *   entity_id given   → returns full state for that entity
 */

const HA_URL = process.env.HA_URL || 'http://192.168.1.210:8123';
const HA_TOKEN = process.env.HA_ACCESS_TOKEN;

if (!HA_TOKEN) {
  console.error('HA_ACCESS_TOKEN env var is required');
  process.exit(1);
}

const entityId = process.argv[2];
const url = entityId ? `${HA_URL}/api/states/${entityId}` : `${HA_URL}/api/states`;

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${HA_TOKEN}` },
});

if (!res.ok) {
  console.error(`HA API error: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const data = await res.json();

if (Array.isArray(data)) {
  const simplified = data.map((e) => ({
    entity_id: e.entity_id,
    state: e.state,
    friendly_name: e.attributes?.friendly_name,
    last_changed: e.last_changed,
  }));
  console.log(JSON.stringify(simplified, null, 2));
} else {
  console.log(
    JSON.stringify(
      {
        entity_id: data.entity_id,
        state: data.state,
        attributes: data.attributes,
        last_changed: data.last_changed,
        last_updated: data.last_updated,
      },
      null,
      2
    )
  );
}
