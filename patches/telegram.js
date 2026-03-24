import { ChannelAdapter } from './base.js';
import {
  sendMessage,
  downloadFile,
  reactToMessage,
  startTypingIndicator,
  getBot,
} from '../tools/telegram.js';
import { isWhisperEnabled, transcribeAudio } from '../tools/openai.js';

/**
 * Generate speech audio from text using ElevenLabs TTS.
 * Returns MP3 buffer or null on failure.
 */
async function textToSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'YOq2y2Up4RgXP2HyXjE5';
  if (!apiKey) return null;

  // Truncate very long responses — TTS gets expensive and slow past ~1000 chars
  const maxChars = 1000;
  let ttsText = text;
  if (ttsText.length > maxChars) {
    ttsText = ttsText.slice(0, maxChars).replace(/\s+\S*$/, '') + '...';
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: ttsText,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) {
      console.error(`[telegram-voice] ElevenLabs TTS error: ${res.status} ${res.statusText}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[telegram-voice] TTS failed:', err.message);
    return null;
  }
}

/**
 * Send a voice message to a Telegram chat.
 * Uses the raw Telegram Bot API (sendVoice supports MP3).
 */
async function sendVoiceMessage(botToken, chatId, audioBuffer) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'voice.mp3');

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram-voice] sendVoice failed: ${res.status}`, body);
  }
}

class TelegramAdapter extends ChannelAdapter {
  constructor(botToken) {
    super();
    this.botToken = botToken;
  }

  /**
   * Parse a Telegram webhook update into normalized message data.
   * Handles: text, voice/audio (transcribed), photos, documents.
   * Returns null if the update should be ignored.
   */
  async receive(request) {
    const { TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHAT_ID, TELEGRAM_VERIFICATION } = process.env;

    // Validate secret token (required)
    if (!TELEGRAM_WEBHOOK_SECRET) {
      console.error('[telegram] TELEGRAM_WEBHOOK_SECRET not configured — rejecting webhook');
      return null;
    }
    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');
    if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return null;
    }

    const update = await request.json();
    const message = update.message || update.edited_message;

    if (!message || !message.chat || !this.botToken) return null;

    const chatId = String(message.chat.id);
    let text = message.text || null;
    const attachments = [];
    let isVoice = false;

    // Check for verification code — works even before TELEGRAM_CHAT_ID is set
    if (TELEGRAM_VERIFICATION && text === TELEGRAM_VERIFICATION) {
      await sendMessage(this.botToken, chatId, `Your chat ID:\n<code>${chatId}</code>`);
      return null;
    }

    // Security: if no TELEGRAM_CHAT_ID configured, ignore all messages
    if (!TELEGRAM_CHAT_ID) return null;

    // Security: only accept messages from configured chat
    if (chatId !== TELEGRAM_CHAT_ID) return null;

    // Voice messages → transcribe to text
    if (message.voice) {
      isVoice = true;
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          'Voice messages are not supported. Please set OPENAI_API_KEY to enable transcription.'
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.voice.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe voice:', err);
        await sendMessage(this.botToken, chatId, 'Sorry, I could not transcribe your voice message.');
        return null;
      }
    }

    // Audio messages → transcribe to text
    if (message.audio && !text) {
      isVoice = true;
      if (!isWhisperEnabled()) {
        await sendMessage(
          this.botToken,
          chatId,
          'Audio messages are not supported. Please set OPENAI_API_KEY to enable transcription.'
        );
        return null;
      }
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.audio.file_id);
        text = await transcribeAudio(buffer, filename);
      } catch (err) {
        console.error('Failed to transcribe audio:', err);
        await sendMessage(this.botToken, chatId, 'Sorry, I could not transcribe your audio message.');
        return null;
      }
    }

    // Photo → download largest size, add as image attachment
    if (message.photo && message.photo.length > 0) {
      try {
        const largest = message.photo[message.photo.length - 1];
        const { buffer } = await downloadFile(this.botToken, largest.file_id);
        attachments.push({ category: 'image', mimeType: 'image/jpeg', data: buffer });
        // Use caption as text if no text yet
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error('Failed to download photo:', err);
      }
    }

    // Document → download, add as document attachment
    if (message.document) {
      try {
        const { buffer, filename } = await downloadFile(this.botToken, message.document.file_id);
        const mimeType = message.document.mime_type || 'application/octet-stream';
        attachments.push({ category: 'document', mimeType, data: buffer });
        if (!text && message.caption) text = message.caption;
      } catch (err) {
        console.error('Failed to download document:', err);
      }
    }

    // Nothing actionable
    if (!text && attachments.length === 0) return null;

    return {
      threadId: chatId,
      text: text || '',
      attachments,
      metadata: { messageId: message.message_id, chatId, isVoice },
    };
  }

  async acknowledge(metadata) {
    await reactToMessage(this.botToken, metadata.chatId, metadata.messageId).catch(() => {});
  }

  startProcessingIndicator(metadata) {
    return startTypingIndicator(this.botToken, metadata.chatId);
  }

  async sendResponse(threadId, text, metadata) {
    // Always send text response first (instant feedback)
    await sendMessage(this.botToken, threadId, text);

    // Always send voice response via ElevenLabs TTS (if configured)
    if (process.env.ELEVENLABS_API_KEY) {
      try {
        // Strip markdown/HTML for cleaner TTS
        const plainText = text
          .replace(/```[\s\S]*?```/g, ' code block omitted ')
          .replace(/`[^`]+`/g, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/__(.+?)__/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/~~(.+?)~~/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[<>]/g, '')
          .trim();

        if (plainText) {
          const audio = await textToSpeech(plainText);
          if (audio) {
            await sendVoiceMessage(this.botToken, threadId, audio);
          }
        }
      } catch (err) {
        console.error('[telegram-voice] Voice response failed:', err.message);
        // Text was already sent — silent failure is fine
      }
    }
  }

  get supportsStreaming() {
    return false;
  }
}

export { TelegramAdapter };
