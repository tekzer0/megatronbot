/**
 * Stream chat route — wraps thepopebot/chat/api with ChromaDB contextual memory.
 *
 * Before each LLM call: retrieves semantically relevant memories and prepends
 * them to the user message as context.
 * After each response: stores the user+assistant exchange in ChromaDB.
 */

import { auth } from 'thepopebot/auth';
import { chatStream } from '../../../node_modules/thepopebot/lib/ai/index.js';
import { v4 as uuidv4 } from 'uuid';
import { retrieveMemory, storeMemory, formatMemoryContext } from '../../../lib/memory.js';

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { messages, chatId: rawChatId, trigger, codeMode, repo, branch, workspaceId } = body;

  if (!messages?.length) {
    return Response.json({ error: 'No messages' }, { status: 400 });
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return Response.json({ error: 'No user message' }, { status: 400 });
  }

  // Extract text from AI SDK v5 message parts or fall back to content
  let userText =
    lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n') ||
    lastUserMessage.content ||
    '';

  // Extract file attachments
  const fileParts = lastUserMessage.parts?.filter((p) => p.type === 'file') || [];
  const attachments = [];

  for (const part of fileParts) {
    const { mediaType, url } = part;
    if (!mediaType || !url) continue;

    if (mediaType.startsWith('image/') || mediaType === 'application/pdf') {
      attachments.push({ category: 'image', mimeType: mediaType, dataUrl: url });
    } else if (mediaType.startsWith('text/') || mediaType === 'application/json') {
      try {
        const base64Data = url.split(',')[1];
        const textContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        const fileName = part.name || 'file';
        userText += `\n\nFile: ${fileName}\n\`\`\`\n${textContent}\n\`\`\``;
      } catch (e) {
        console.error('[stream/chat] Failed to decode text file:', e);
      }
    }
  }

  if (!userText.trim() && attachments.length === 0) {
    return Response.json({ error: 'Empty message' }, { status: 400 });
  }

  const threadId = rawChatId || uuidv4();

  // ── Memory: inject relevant context ───────────────────────────────────────
  let enrichedText = userText;
  const memories = await retrieveMemory(userText);
  if (memories.length > 0) {
    enrichedText = formatMemoryContext(memories) + userText;
    console.log(`[memory] injected ${memories.length} memories into web chat`);
  }

  const { createUIMessageStream, createUIMessageStreamResponse } = await import('ai');

  // Collect assistant response for post-stream memory storage
  let fullResponse = '';

  const stream = createUIMessageStream({
    onError: (error) => {
      console.error('[stream/chat] error:', error);
      return error?.message || 'An error occurred while processing your message.';
    },
    execute: async ({ writer }) => {
      const skipUserPersist = trigger === 'regenerate-message';
      const streamOptions = {
        userId: session.user.id,
        skipUserPersist,
      };
      if (codeMode && repo && branch) {
        streamOptions.repo = repo;
        streamOptions.branch = branch;
        if (workspaceId) streamOptions.workspaceId = workspaceId;
      }

      const chunks = chatStream(threadId, enrichedText, attachments, streamOptions);

      writer.write({ type: 'start' });

      let textStarted = false;
      let textId = uuidv4();

      for await (const chunk of chunks) {
        if (chunk.type === 'text') {
          if (!textStarted) {
            textId = uuidv4();
            writer.write({ type: 'text-start', id: textId });
            textStarted = true;
          }
          writer.write({ type: 'text-delta', id: textId, delta: chunk.text });
          fullResponse += chunk.text;
        } else if (chunk.type === 'tool-call') {
          if (textStarted) {
            writer.write({ type: 'text-end', id: textId });
            textStarted = false;
          }
          writer.write({
            type:       'tool-input-start',
            toolCallId: chunk.toolCallId,
            toolName:   chunk.toolName,
          });
          writer.write({
            type:       'tool-input-available',
            toolCallId: chunk.toolCallId,
            toolName:   chunk.toolName,
            input:      chunk.args,
          });
        } else if (chunk.type === 'tool-result') {
          writer.write({
            type:       'tool-output-available',
            toolCallId: chunk.toolCallId,
            output:     chunk.result,
          });
        }
      }

      if (textStarted) {
        writer.write({ type: 'text-end', id: textId });
      }
      writer.write({ type: 'finish' });

      // ── Memory: store this exchange ────────────────────────────────────────
      if (userText.trim() && fullResponse.trim()) {
        storeMemory(
          `user: ${userText}\nassistant: ${fullResponse}`,
          { channel: 'web', threadId }
        ).catch(() => {});
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
