import { NextResponse } from 'next/server';

/**
 * POST /api/voice/transcribe
 * Transcribes audio using Groq Whisper Large v3 Turbo.
 * Called by the patched use-voice-input.js hook.
 *
 * Expects multipart form data with an 'audio' field (Blob/File).
 * Returns { text: string } on success.
 */
export async function POST(request) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY not set — voice transcription unavailable' },
      { status: 400 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!audio) {
    return NextResponse.json({ error: 'No audio field in request' }, { status: 400 });
  }

  const groqForm = new FormData();
  groqForm.append('file', audio, 'voice.webm');
  groqForm.append('model', 'whisper-large-v3-turbo');
  groqForm.append('language', 'en');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: groqForm,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    console.error('[voice/transcribe] Groq error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ text: data.text ?? '' });
}
