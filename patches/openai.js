/**
 * Check if Whisper transcription is enabled (supports OpenAI or Groq)
 * @returns {boolean}
 */
function isWhisperEnabled() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
}

/**
 * Transcribe audio using OpenAI Whisper API or Groq as fallback
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename (e.g., "voice.ogg")
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioBuffer, filename) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const apiKey = openaiKey || groqKey;
  const baseUrl = openaiKey
    ? 'https://api.openai.com/v1'
    : 'https://api.groq.com/openai/v1';
  const model = openaiKey ? 'whisper-1' : 'whisper-large-v3-turbo';

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', model);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Transcription API error: ${response.status} ${error}`);
  }

  const result = await response.json();
  return result.text;
}

export { isWhisperEnabled, transcribeAudio };
