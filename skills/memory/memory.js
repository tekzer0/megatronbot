#!/usr/bin/env node
/**
 * Megatron memory skill — CLI for ChromaDB contextual memory
 *
 * Usage:
 *   node memory.js remember "<text>" [--channel <channel>]
 *   node memory.js recall "<query>" [--top <n>]
 *
 * Env vars (read from project root .env if not already set):
 *   CHROMA_URL, EMBED_MODEL, OPENAI_BASE_URL, MEMORY_TOP_K
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root (two levels up from skills/memory/)
function loadDotenv(path) {
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!(key in process.env)) process.env[key] = rest.join('=');
    }
  } catch {}
}
loadDotenv(resolve(__dirname, '../../.env'));

const CHROMA_URL  = process.env.CHROMA_URL    || 'http://192.168.1.230:8000';
const EMBED_MODEL = process.env.EMBED_MODEL   || 'nomic-embed-text';
const OLLAMA_URL  = process.env.OPENAI_BASE_URL || 'http://192.168.1.241:11434/v1';
const DEFAULT_TOP = parseInt(process.env.MEMORY_TOP_K || '5', 10);
const TENANT      = 'default_tenant';
const DATABASE    = 'default_database';
const COLLECTION  = 'megatron_memory';
const BASE        = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function embed(text) {
  const r = await fetch(`${OLLAMA_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`Embedding failed: ${r.status}`);
  const d = await r.json();
  return d.data[0].embedding;
}

async function getCollectionId() {
  const r = await fetch(`${BASE}/collections?name=${encodeURIComponent(COLLECTION)}`);
  if (!r.ok) throw new Error(`ChromaDB unreachable: ${r.status}`);
  const list = await r.json();
  const existing = Array.isArray(list) ? list.find(c => c.name === COLLECTION) : null;
  if (existing) return existing.id;

  const cr = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: COLLECTION,
      metadata: { 'hnsw:space': 'cosine' },
      get_or_create: true,
    }),
  });
  if (!cr.ok) throw new Error(`Collection create failed: ${cr.status}`);
  return (await cr.json()).id;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function remember(text, channel = 'agent') {
  const colId = await getCollectionId();
  const embedding = await embed(text);
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const r = await fetch(`${BASE}/collections/${colId}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids:        [id],
      embeddings: [embedding],
      documents:  [text],
      metadatas:  [{ ts: Date.now(), channel }],
    }),
  });

  if (!r.ok) {
    console.error(`Failed to store memory: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log(`✓ Memory stored [${channel}]: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`);
}

async function recall(query, topK = DEFAULT_TOP) {
  const colId = await getCollectionId();
  const embedding = await embed(query);

  const r = await fetch(`${BASE}/collections/${colId}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embeddings: [embedding],
      n_results:        topK,
      include:          ['documents', 'distances', 'metadatas'],
    }),
  });

  if (!r.ok) {
    console.error(`Failed to query memories: ${r.status} ${await r.text()}`);
    process.exit(1);
  }

  const data = await r.json();
  const docs  = data.documents?.[0] || [];
  const dists = data.distances?.[0]  || [];
  const metas = data.metadatas?.[0]  || [];

  if (!docs.length) {
    console.log('No relevant memories found.');
    return;
  }

  console.log(`\n── ${docs.length} memories for: "${query}" ──\n`);
  docs.forEach((doc, i) => {
    const score = dists[i] !== undefined ? (1 - dists[i]).toFixed(3) : '?';
    const ch    = metas[i]?.channel || '?';
    // handle both seconds (Python) and milliseconds (JS) timestamps
    const rawTs = metas[i]?.ts;
    const ts    = rawTs ? new Date(rawTs < 1e12 ? rawTs * 1000 : rawTs).toISOString().slice(0, 10) : '?';
    console.log(`[${i + 1}] score=${score} channel=${ch} date=${ts}`);
    console.log(doc);
    console.log();
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd  = args[0];
const text = args[1];

if (!cmd || !text) {
  console.error('Usage: node memory.js remember "<text>" [--channel <ch>]');
  console.error('       node memory.js recall "<query>" [--top <n>]');
  process.exit(1);
}

const flagIdx = (flag) => args.indexOf(flag);
const flagVal = (flag, def) => {
  const i = flagIdx(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

if (cmd === 'remember') {
  const channel = flagVal('--channel', 'agent');
  remember(text, channel).catch(e => { console.error(e.message); process.exit(1); });
} else if (cmd === 'recall') {
  const topK = parseInt(flagVal('--top', String(DEFAULT_TOP)), 10);
  recall(text, topK).catch(e => { console.error(e.message); process.exit(1); });
} else {
  console.error(`Unknown command: ${cmd}. Use 'remember' or 'recall'.`);
  process.exit(1);
}
