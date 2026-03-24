/**
 * Megatron contextual memory — ChromaDB v2 + Ollama nomic-embed-text
 *
 * Provides semantic memory storage and retrieval across all channels
 * (web UI, Telegram, voice). Memory is stored as conversation exchanges
 * with channel and timestamp metadata.
 *
 * Env vars:
 *   CHROMA_URL       — ChromaDB base URL (default: http://192.168.1.230:8000)
 *   EMBED_MODEL      — Ollama embedding model (default: nomic-embed-text)
 *   OPENAI_BASE_URL  — Ollama base URL for embeddings (default: http://192.168.1.241:11434/v1)
 *   MEMORY_TOP_K     — Number of memories to retrieve (default: 5)
 */

const CHROMA_URL   = process.env.CHROMA_URL    || 'http://192.168.1.230:8000';
const EMBED_MODEL  = process.env.EMBED_MODEL   || 'nomic-embed-text';
const OLLAMA_URL   = process.env.OPENAI_BASE_URL || 'http://192.168.1.241:11434/v1';
const TOP_K        = parseInt(process.env.MEMORY_TOP_K || '5', 10);

const TENANT       = 'default_tenant';
const DATABASE     = 'default_database';
const COLLECTION   = 'megatron_memory';

const BASE = `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}`;

// Cached collection ID to avoid repeated lookups
let _collectionId = null;

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * Get embedding vector for text via Ollama nomic-embed-text.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  const resp = await fetch(`${OLLAMA_URL}/embeddings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`Embedding failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.data[0].embedding;
}

// ─── Collection ───────────────────────────────────────────────────────────────

/**
 * Get (or create) the megatron_memory collection, caching its ID.
 * @returns {Promise<string>} collection ID
 */
async function getCollectionId() {
  if (_collectionId) return _collectionId;

  // Try to fetch existing collection by name
  const listResp = await fetch(`${BASE}/collections?name=${encodeURIComponent(COLLECTION)}`);
  if (!listResp.ok) throw new Error(`ChromaDB list failed: ${listResp.status}`);
  const list = await listResp.json();

  const existing = Array.isArray(list) ? list.find(c => c.name === COLLECTION) : null;
  if (existing) {
    _collectionId = existing.id;
    return _collectionId;
  }

  // Create collection (no embedding_function — we supply pre-computed embeddings)
  const createResp = await fetch(`${BASE}/collections`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:      COLLECTION,
      metadata:  { description: 'Megatron contextual memory', 'hnsw:space': 'cosine' },
      get_or_create: true,
    }),
  });
  if (!createResp.ok) throw new Error(`ChromaDB create failed: ${createResp.status} ${await createResp.text()}`);
  const col = await createResp.json();
  _collectionId = col.id;
  return _collectionId;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Store a memory document in ChromaDB.
 *
 * @param {string} text       — The text to remember (e.g. "user: ...\nassistant: ...")
 * @param {object} [metadata] — Extra metadata: channel, threadId, etc.
 * @returns {Promise<void>}
 */
export async function storeMemory(text, metadata = {}) {
  try {
    const colId     = await getCollectionId();
    const embedding = await embed(text);
    const id        = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const resp = await fetch(`${BASE}/collections/${colId}/add`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        ids:        [id],
        embeddings: [embedding],
        documents:  [text],
        metadatas:  [{ ts: Date.now(), ...metadata }],
      }),
    });
    if (!resp.ok) {
      console.error(`[memory] store failed: ${resp.status} ${await resp.text()}`);
    }
  } catch (err) {
    // Memory failures must never crash the main app
    console.error('[memory] storeMemory error:', err.message);
  }
}

/**
 * Retrieve the most semantically relevant memories for a query.
 *
 * @param {string}  query     — Text to search for
 * @param {number}  [topK]    — Number of results (default: MEMORY_TOP_K)
 * @param {object}  [where]   — Optional ChromaDB metadata filter
 * @returns {Promise<string[]>} Array of memory document strings, closest first
 */
export async function retrieveMemory(query, topK = TOP_K, where = null) {
  try {
    const colId     = await getCollectionId();
    const embedding = await embed(query);

    const body = {
      query_embeddings: [embedding],
      n_results:        topK,
      include:          ['documents', 'distances'],
    };
    if (where) body.where = where;

    const resp = await fetch(`${BASE}/collections/${colId}/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`[memory] query failed: ${resp.status} ${await resp.text()}`);
      return [];
    }
    const data = await resp.json();
    return (data.documents?.[0] || []);
  } catch (err) {
    console.error('[memory] retrieveMemory error:', err.message);
    return [];
  }
}

/**
 * Format retrieved memories as a context block to prepend to messages.
 * Returns an empty string if no memories found.
 *
 * @param {string[]} memories
 * @returns {string}
 */
export function formatMemoryContext(memories) {
  if (!memories.length) return '';
  return [
    '--- Relevant context from past conversations ---',
    ...memories.map((m, i) => `[${i + 1}] ${m}`),
    '--- End of context ---',
    '',
  ].join('\n');
}
