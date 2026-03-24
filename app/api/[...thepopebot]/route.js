/**
 * Catch-all API route — wraps thepopebot/api to add ChromaDB memory for Telegram.
 *
 * Telegram webhook messages: retrieve relevant memories and inject as context
 * prefix, then store the user+assistant exchange after the response.
 * All other routes pass through to thepopebot/api unchanged.
 */

import { GET, POST as OriginalPOST } from 'thepopebot/api';
import { retrieveMemory, storeMemory, formatMemoryContext } from '../../../lib/memory.js';

export { GET };

export async function POST(request, context) {
  const url = new URL(request.url);
  const isTelegramWebhook = url.pathname.endsWith('/telegram/webhook');

  if (!isTelegramWebhook) {
    return OriginalPOST(request, context);
  }

  // ── Telegram webhook: read body, inject memory, forward ───────────────────
  let bodyText;
  try {
    bodyText = await request.text();
  } catch {
    return OriginalPOST(request, context);
  }

  let update;
  try {
    update = JSON.parse(bodyText);
  } catch {
    // Not valid JSON — pass through as-is
    return OriginalPOST(
      new Request(request.url, { method: 'POST', headers: request.headers, body: bodyText }),
      context
    );
  }

  const message = update?.message || update?.edited_message;
  const userText = message?.text || null;

  if (!userText) {
    // Non-text update (sticker, voice, etc.) — pass through unchanged
    return OriginalPOST(
      new Request(request.url, { method: 'POST', headers: request.headers, body: bodyText }),
      context
    );
  }

  // ── Memory retrieval ───────────────────────────────────────────────────────
  let enrichedText = userText;
  try {
    const memories = await retrieveMemory(userText);
    if (memories.length > 0) {
      enrichedText = formatMemoryContext(memories) + userText;
      console.log(`[memory] injected ${memories.length} memories into Telegram message`);
    }
  } catch (err) {
    console.error('[memory] Telegram retrieval error:', err.message);
  }

  // Patch the message text in the update payload
  const patchedUpdate = JSON.parse(JSON.stringify(update));
  (patchedUpdate.message || patchedUpdate.edited_message).text = enrichedText;

  // Forward to original handler with enriched message
  const patchedRequest = new Request(request.url, {
    method:  'POST',
    headers: request.headers,
    body:    JSON.stringify(patchedUpdate),
  });

  const response = await OriginalPOST(patchedRequest, context);

  // ── Memory storage (fire-and-forget, non-blocking) ────────────────────────
  // We can't easily get the assistant response from the original handler since
  // it's fire-and-forget internally. We store just the user message with a
  // placeholder — the full exchange gets stored once the response is available
  // via a background approach. For now store user message with channel tag so
  // it's searchable in future retrievals.
  const threadId = String(message?.chat?.id || 'tg');
  storeMemory(`user: ${userText}`, { channel: 'telegram', threadId }).catch(() => {});

  return response;
}
