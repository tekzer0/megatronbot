#!/usr/bin/env python3
"""
Megatron Voice Assistant
Wake word detection: faster-whisper on short chunks (no Porcupine, no .ppn files)
STT: faster-whisper base (on-device)
LLM: Groq (configurable model)
TTS: ElevenLabs → mpg123

Configuration: read from parent .env (project root) then voice/.env (local override).
Personalized system prompt: voice/system_prompt.md (gitignored, user-created from example).
"""

import os
import re
import json
import uuid
import wave
import struct
import signal
import time
import subprocess
import numpy as np
import requests
from datetime import datetime
from faster_whisper import WhisperModel

import alsaaudio

os.environ['ORT_LOGGING_LEVEL'] = '3'

# --- Paths ---

_VOICE_DIR   = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR = os.path.dirname(_VOICE_DIR)


# --- Config ---

def load_dotenv(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, val = line.partition('=')
                if key not in os.environ:
                    os.environ[key] = val
    except FileNotFoundError:
        pass

# Load voice-local .env first (takes precedence), then project root .env as fallback
load_dotenv(os.path.join(_VOICE_DIR, '.env'))
load_dotenv(os.path.join(_PROJECT_DIR, '.env'))

GROQ_API_KEY        = os.environ.get('GROQ_API_KEY', '')
GOOGLE_API_KEY      = os.environ.get('GOOGLE_API_KEY', '')
OLLAMA_BASE_URL     = os.environ.get('OPENAI_BASE_URL', '')
OLLAMA_API_KEY      = os.environ.get('CUSTOM_API_KEY', 'ollama')
OLLAMA_MODEL        = os.environ.get('LLM_MODEL', 'llama3.2')
ELEVENLABS_API_KEY  = os.environ.get('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'YOq2y2Up4RgXP2HyXjE5')
ELEVENLABS_MODEL    = 'eleven_flash_v2_5'
ELEVENLABS_SPEED    = float(os.environ.get('ELEVENLABS_SPEED', '1.15'))
GROQ_MODEL          = os.environ.get('VOICE_LLM_MODEL', 'moonshotai/kimi-k2-instruct')
GEMINI_MODEL        = os.environ.get('VOICE_FALLBACK_MODEL', 'gemini-2.5-flash')

# LLM providers: Gemini primary, Ollama runner fallback, Groq fallback
LLM_PROVIDERS = []
if GOOGLE_API_KEY:
    LLM_PROVIDERS.append({
        'name': 'Gemini',
        'url': 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        'key': GOOGLE_API_KEY,
        'model': GEMINI_MODEL,
    })
if OLLAMA_BASE_URL:
    LLM_PROVIDERS.append({
        'name': 'Ollama',
        'url': OLLAMA_BASE_URL.rstrip('/') + '/chat/completions',
        'key': OLLAMA_API_KEY,
        'model': OLLAMA_MODEL,
    })
if GROQ_API_KEY:
    LLM_PROVIDERS.append({
        'name': 'Groq',
        'url': 'https://api.groq.com/openai/v1/chat/completions',
        'key': GROQ_API_KEY,
        'model': GROQ_MODEL,
    })

HA_URL              = os.environ.get('HA_URL', 'http://homeassistant.local:8123')
HA_TOKEN            = os.environ.get('HA_ACCESS_TOKEN', '')

# ChromaDB contextual memory
CHROMA_URL          = os.environ.get('CHROMA_URL', 'http://192.168.1.230:8000')
EMBED_MODEL         = os.environ.get('EMBED_MODEL', 'nomic-embed-text')
CHROMA_TENANT       = 'default_tenant'
CHROMA_DATABASE     = 'default_database'
CHROMA_COLLECTION   = 'megatron_memory'
MEMORY_TOP_K        = int(os.environ.get('MEMORY_TOP_K', '5'))

# Cached ChromaDB collection ID
_chroma_collection_id = None

WAKE_WORD           = os.environ.get('VOICE_WAKE_WORD', 'megatron')
# Whisper tiny sometimes transcribes the wake word differently — catch variants
WAKE_ALIASES_RAW    = os.environ.get('VOICE_WAKE_ALIASES', 'megatron,mega tron,mega-tron,megaton,meg a tron')
WAKE_ALIASES        = [a.strip() for a in WAKE_ALIASES_RAW.split(',')]

WHISPER_WAKE_SIZE   = os.environ.get('VOICE_WHISPER_WAKE', 'tiny')   # fast, just catches one word
WHISPER_STT_SIZE    = os.environ.get('VOICE_WHISPER_STT', 'base')    # better accuracy for commands

# Audio device config — set these in .env to match your hardware
# Run `arecord -l` to list capture devices, `aplay -l` to list playback devices
RESPEAKER_CARD      = int(os.environ.get('VOICE_MIC_CARD', '0'))
RESPEAKER_DEVICE    = os.environ.get('VOICE_MIC_DEVICE', 'plughw:0,0')
SPEAKER_DEVICE      = os.environ.get('VOICE_SPEAKER_DEVICE', 'plughw:0,0')

CHANNELS            = int(os.environ.get('VOICE_MIC_CHANNELS', '2'))
SAMPLE_RATE         = 16000
CHUNK_SIZE          = 512

# VAD — looser values to avoid cutting off speech mid-sentence
SILENCE_THRESHOLD   = int(os.environ.get('VOICE_SILENCE_THRESHOLD', '300'))
SILENCE_DURATION    = float(os.environ.get('VOICE_SILENCE_DURATION', '2.0'))
MAX_RECORD_SECONDS  = int(os.environ.get('VOICE_MAX_RECORD_SECONDS', '12'))

# Wake word chunk duration
WAKE_CHUNK_SECONDS  = 2


# --- System Prompt ---

def load_system_prompt():
    """
    Load system prompt.
    Base prompt is generic. Personalized content (HA entities, local network info)
    is appended from voice/system_prompt.md if it exists.
    Create yours from voice/system_prompt.example.md.
    """
    base = f"""You are {WAKE_WORD.capitalize()}, a helpful and witty voice assistant.
Your responses are spoken aloud through a speaker, so be conversational — 1-2 sentences unless the user wants more detail. Tell jokes when asked, answer questions, have personality. You're friendly and a bit sarcastic.

For Home Assistant smart home control:
- Output silent command tags BEFORE your spoken reply (the user never hears the tags).
- NEVER say entity IDs, service names, JSON, or technical details aloud. Only speak natural language.
- Example: <HA_COMMAND>{{"service": "light.turn_off", "entity_id": "light.example"}}</HA_COMMAND>
  Done, the light is off.
- Multiple command tags are fine. Your spoken reply always goes AFTER all tags."""

    prompt_file = os.path.join(_VOICE_DIR, 'system_prompt.md')
    if os.path.exists(prompt_file):
        with open(prompt_file) as f:
            extra = f.read().strip()
        if extra:
            base += '\n\n' + extra
    return base

SYSTEM_PROMPT = load_system_prompt()


# ─── Memory (ChromaDB + nomic-embed-text) ─────────────────────────────────────

def _get_embedding(text):
    """Get embedding vector from Ollama nomic-embed-text."""
    try:
        resp = requests.post(
            OLLAMA_BASE_URL.rstrip('/') + '/embeddings',
            headers={'Content-Type': 'application/json'},
            json={'model': EMBED_MODEL, 'input': text},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()['data'][0]['embedding']
    except Exception as e:
        print(f'⚠  [memory] embedding failed: {e}')
        return None


def _get_chroma_collection_id():
    """Get (or create) the megatron_memory collection, caching its ID."""
    global _chroma_collection_id
    if _chroma_collection_id:
        return _chroma_collection_id

    base = f'{CHROMA_URL}/api/v2/tenants/{CHROMA_TENANT}/databases/{CHROMA_DATABASE}'
    try:
        resp = requests.get(
            f'{base}/collections',
            params={'name': CHROMA_COLLECTION},
            timeout=5,
        )
        resp.raise_for_status()
        collections = resp.json()
        existing = next((c for c in collections if c['name'] == CHROMA_COLLECTION), None)
        if existing:
            _chroma_collection_id = existing['id']
            return _chroma_collection_id

        # Create collection
        resp = requests.post(
            f'{base}/collections',
            headers={'Content-Type': 'application/json'},
            json={
                'name': CHROMA_COLLECTION,
                'metadata': {'description': 'Megatron contextual memory', 'hnsw:space': 'cosine'},
                'get_or_create': True,
            },
            timeout=5,
        )
        resp.raise_for_status()
        _chroma_collection_id = resp.json()['id']
        return _chroma_collection_id
    except Exception as e:
        print(f'⚠  [memory] ChromaDB collection init failed: {e}')
        return None


def store_memory(user_text, assistant_text):
    """Store a voice conversation exchange in ChromaDB."""
    try:
        col_id = _get_chroma_collection_id()
        if not col_id:
            return
        text = f'user: {user_text}\nassistant: {assistant_text}'
        embedding = _get_embedding(text)
        if not embedding:
            return
        mem_id = f'mem_voice_{int(time.time())}_{uuid.uuid4().hex[:6]}'
        base = f'{CHROMA_URL}/api/v2/tenants/{CHROMA_TENANT}/databases/{CHROMA_DATABASE}'
        resp = requests.post(
            f'{base}/collections/{col_id}/add',
            headers={'Content-Type': 'application/json'},
            json={
                'ids':        [mem_id],
                'embeddings': [embedding],
                'documents':  [text],
                'metadatas':  [{'ts': int(time.time()), 'channel': 'voice'}],
            },
            timeout=10,
        )
        if not resp.ok:
            print(f'⚠  [memory] store failed: {resp.status_code}')
    except Exception as e:
        print(f'⚠  [memory] store error: {e}')


def retrieve_memory(query, top_k=MEMORY_TOP_K):
    """Retrieve semantically relevant memories for a query."""
    try:
        col_id = _get_chroma_collection_id()
        if not col_id:
            return []
        embedding = _get_embedding(query)
        if not embedding:
            return []
        base = f'{CHROMA_URL}/api/v2/tenants/{CHROMA_TENANT}/databases/{CHROMA_DATABASE}'
        resp = requests.post(
            f'{base}/collections/{col_id}/query',
            headers={'Content-Type': 'application/json'},
            json={
                'query_embeddings': [embedding],
                'n_results':        top_k,
                'include':          ['documents', 'distances'],
            },
            timeout=10,
        )
        if not resp.ok:
            print(f'⚠  [memory] query failed: {resp.status_code}')
            return []
        data = resp.json()
        return data.get('documents', [[]])[0] or []
    except Exception as e:
        print(f'⚠  [memory] retrieve error: {e}')
        return []


def format_memory_context(memories):
    """Format memory list as a context block for the system prompt."""
    if not memories:
        return ''
    lines = ['--- Relevant context from past conversations ---']
    for i, m in enumerate(memories, 1):
        lines.append(f'[{i}] {m}')
    lines.append('--- End of context ---')
    return '\n'.join(lines) + '\n\n'


class MegatronClient:
    def __init__(self):
        self.audio_input    = None
        self.whisper_wake   = None
        self.whisper_stt    = None
        self.audio_buffer   = []
        self.history        = []

    def configure_mic_gain(self):
        """Try to set microphone gain via amixer (silently skips if not supported)"""
        try:
            subprocess.run(
                ['amixer', '-c', str(RESPEAKER_CARD), 'set', 'Capture', '85%'],
                capture_output=True
            )
            subprocess.run(
                ['amixer', '-c', str(RESPEAKER_CARD), 'set', 'ADC PCM', '85%'],
                capture_output=True
            )
            print('✓ Microphone gain configured')
        except Exception as e:
            print(f'⚠  Could not configure gain: {e}')

    def initialize(self):
        print('=' * 60)
        print(f'{WAKE_WORD.capitalize()} Voice Assistant')
        print('=' * 60)

        self.configure_mic_gain()

        print(f'Loading Whisper {WHISPER_WAKE_SIZE} (wake word)...')
        self.whisper_wake = WhisperModel(WHISPER_WAKE_SIZE, device='cpu', compute_type='float32')

        print(f'Loading Whisper {WHISPER_STT_SIZE} (transcription)...')
        self.whisper_stt = WhisperModel(WHISPER_STT_SIZE, device='cpu', compute_type='float32')

        self.audio_input = alsaaudio.PCM(
            alsaaudio.PCM_CAPTURE,
            alsaaudio.PCM_NORMAL,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            format=alsaaudio.PCM_FORMAT_S16_LE,
            periodsize=CHUNK_SIZE,
            device=RESPEAKER_DEVICE
        )

        print(f'✓ Wake word: "{WAKE_WORD}"')
        print(f'✓ Mic device: {RESPEAKER_DEVICE} (card {RESPEAKER_CARD})')
        print(f'✓ Speaker: {SPEAKER_DEVICE}')
        llm_chain = ' → '.join(f'{p["name"]} ({p["model"]})' for p in LLM_PROVIDERS)
        print(f'✓ LLM: {llm_chain or "NONE CONFIGURED"}')
        print(f'✓ TTS: ElevenLabs {ELEVENLABS_VOICE_ID}')
        ha_status = '✓ Home Assistant: enabled' if HA_TOKEN else '⚠  Home Assistant: no HA_ACCESS_TOKEN set'
        print(ha_status)
        print('=' * 60)

    def audio_chunks_to_float(self, chunks, channels=None):
        """Convert raw audio chunks to float32 mono array for Whisper"""
        if channels is None:
            channels = CHANNELS
        raw = b''.join(chunks)
        audio_np = np.frombuffer(raw, dtype=np.int16)
        if channels == 2:
            audio_np = audio_np.reshape(-1, 2).mean(axis=1)
        return audio_np.astype(np.float32) / 32768.0

    def transcribe_with_model(self, model, audio_float, prompt=''):
        """Run Whisper transcription and return joined text"""
        segments, _ = model.transcribe(
            audio_float,
            language='en',
            beam_size=5,
            best_of=5,
            temperature=0.0,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            vad_filter=False,
            without_timestamps=True
        )
        return ' '.join(s.text for s in segments).strip()

    def beep(self):
        """Play a short 0.2s tone so user knows to speak"""
        import struct, math, tempfile
        rate = 16000
        freq = 880
        duration = 0.2
        num_samples = int(rate * duration)
        samples = [int(32767 * math.sin(2 * math.pi * freq * i / rate)) for i in range(num_samples)]
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            tmp = f.name
        with wave.open(tmp, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(rate)
            wf.writeframes(struct.pack(f'<{num_samples}h', *samples))
        try:
            subprocess.run(['aplay', '-D', SPEAKER_DEVICE, '-q', tmp],
                           capture_output=True, timeout=1)
        finally:
            os.unlink(tmp)

    def listen_for_wake_word(self):
        """Continuously buffer audio and check for wake word using Whisper.
        Rolling 3s buffer, checked every 2s (overlap catches words at chunk edges).
        If command spoken in same breath, use directly. Otherwise beep and record.
        """
        print(f'\nListening for "{WAKE_WORD}"...\n')
        wake_buffer = []
        chunk_step   = int(WAKE_CHUNK_SECONDS * SAMPLE_RATE / CHUNK_SIZE)
        chunk_window = int(3 * SAMPLE_RATE / CHUNK_SIZE)
        chunks_since_check = 0
        io_errors = 0

        try:
            while True:
                try:
                    length, data = self.audio_input.read()
                except alsaaudio.ALSAAudioError as e:
                    io_errors += 1
                    if io_errors > 10:
                        print(f'✗ Audio device unrecoverable ({e}), exiting.')
                        break
                    print(f'⚠  Audio read error ({e}), retrying in 1s...')
                    time.sleep(1)
                    continue
                io_errors = 0
                if length <= 0:
                    continue

                wake_buffer.append(data)
                if len(wake_buffer) > chunk_window:
                    wake_buffer = wake_buffer[-chunk_window:]

                chunks_since_check += 1
                if chunks_since_check < chunk_step:
                    continue
                chunks_since_check = 0

                audio_float = self.audio_chunks_to_float(wake_buffer)
                text = self.transcribe_with_model(
                    self.whisper_wake, audio_float,
                    prompt=WAKE_WORD.capitalize()
                )

                tclean = text.strip().lower().rstrip('.')
                HALLUCINATIONS = {
                    '', WAKE_WORD, 'thank you', 'thanks', 'music playing',
                    'music', '...', '.. ..', '... ...', 'you', 'you you',
                    'the', 'the end', 'end', 'bye', 'bye bye', 'k',
                    'please subscribe', 'subscribe', 'subtitles by',
                    'thanks for watching', 'thanks for watching!',
                    'thank you for watching', 'silence', 'hmm',
                }
                is_hallucination = tclean in HALLUCINATIONS or tclean.startswith('♪')
                if tclean and not is_hallucination:
                    print(f'  heard: "{text.strip()}"')

                tl = text.lower()
                if not is_hallucination and any(alias in tl for alias in WAKE_ALIASES):
                    print(f'\n🎤 "{WAKE_WORD}" detected! [{datetime.now().strftime("%H:%M:%S")}]')
                    wake_buffer = []

                    after_wake = tl
                    for alias in WAKE_ALIASES:
                        if alias in tl:
                            after_wake = tl.split(alias, 1)[-1].strip(' .,!?')
                            break
                    # If what's left is just another wake alias or too short, listen fresh
                    is_just_wake = len(after_wake) <= 3 or after_wake in WAKE_ALIASES
                    if not is_just_wake:
                        print(f'  (inline command: "{after_wake}")')
                        self.process_transcription(after_wake)
                    else:
                        self.record_and_respond()

                    print(f'Listening for "{WAKE_WORD}"...\n')

        except KeyboardInterrupt:
            print('\nShutting down.')
        finally:
            self.cleanup()

    def calculate_audio_energy(self, audio_data):
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        return np.sqrt(np.mean(np.abs(audio_array.astype(np.float32)) ** 2))

    def record_and_respond(self):
        """Record command with VAD then transcribe and respond"""
        print('📝 Recording (stops when you stop talking)...')
        self.audio_buffer = []

        silence_chunks = 0
        silence_needed = int(SILENCE_DURATION * SAMPLE_RATE / CHUNK_SIZE)
        max_chunks     = int(MAX_RECORD_SECONDS * SAMPLE_RATE / CHUNK_SIZE)
        # Don't allow silence detection to trigger until user has had time to start speaking
        min_chunks     = int(1.5 * SAMPLE_RATE / CHUNK_SIZE)

        for i in range(max_chunks):
            length, data = self.audio_input.read()
            if length <= 0:
                continue

            self.audio_buffer.append(data)
            energy = self.calculate_audio_energy(data)

            if energy < SILENCE_THRESHOLD:
                silence_chunks += 1
                if i >= min_chunks and silence_chunks >= silence_needed:
                    print(f'✓ Stopped (silence after {i * CHUNK_SIZE / SAMPLE_RATE:.1f}s)')
                    break
            else:
                silence_chunks = 0

        print('🔄 Transcribing...')
        t0 = datetime.now()
        audio_float   = self.audio_chunks_to_float(self.audio_buffer)
        stt_prompt    = 'Smart home voice commands.'
        transcription = self.transcribe_with_model(
            self.whisper_stt, audio_float,
            prompt=stt_prompt
        )
        # Filter out Whisper prompt echoes (it parrots the prompt when audio is too quiet)
        prompt_echoes = {'smart home voice commands', 'clear speech', 'smart home voice commands. clear speech'}
        if transcription.strip().lower().rstrip('.') in prompt_echoes:
            transcription = ''
        print(f'✓ ({(datetime.now()-t0).total_seconds():.2f}s): "{transcription}"')

        if not transcription:
            print('✗ No speech detected')
            return

        self.process_transcription(transcription)

    def process_transcription(self, transcription):
        """Send transcription to LLM, execute HA commands, speak response.
        Errors are caught and spoken aloud instead of crashing.
        """
        print('🤖 Processing...')
        t0 = datetime.now()
        try:
            response_text = self.chat(transcription)
        except Exception as e:
            print(f'✗ LLM error: {e}')
            response_text = "Sorry, I couldn't reach the server. Try again in a moment."
        print(f'✓ ({(datetime.now()-t0).total_seconds():.1f}s)')

        ha_commands = self.extract_ha_commands(response_text)
        for cmd in ha_commands:
            self.execute_ha_command(cmd)

        spoken = self.clean_response(response_text)
        if spoken:
            print(f'{WAKE_WORD.capitalize()}: {spoken}')
            try:
                audio_bytes = self.tts(spoken)
                self.play_mp3(audio_bytes)
            except Exception as e:
                print(f'✗ TTS/playback error: {e}')

        print('-' * 60)

    # --- LLM ---

    def chat(self, user_text):
        # ── Memory: retrieve relevant context ─────────────────────────────────
        memories = retrieve_memory(user_text)
        system_prompt = SYSTEM_PROMPT
        if memories:
            system_prompt = format_memory_context(memories) + SYSTEM_PROMPT
            print(f'  [memory] injected {len(memories)} memories')

        self.history.append({'role': 'user', 'content': user_text})
        messages = [{'role': 'system', 'content': system_prompt}] + self.history[-10:]

        last_error = None
        for provider in LLM_PROVIDERS:
            try:
                resp = requests.post(
                    provider['url'],
                    headers={'Authorization': f'Bearer {provider["key"]}', 'Content-Type': 'application/json'},
                    json={'model': provider['model'], 'messages': messages, 'max_tokens': 400},
                    timeout=30,
                )
                resp.raise_for_status()
                reply = resp.json()['choices'][0]['message']['content']
                self.history.append({'role': 'assistant', 'content': reply})
                print(f'  (via {provider["name"]})')

                # ── Memory: store this exchange ────────────────────────────────
                store_memory(user_text, reply)

                return reply
            except Exception as e:
                last_error = e
                print(f'⚠  {provider["name"]} failed: {e}')

        raise last_error or RuntimeError('No LLM providers configured')

    # --- Home Assistant ---

    def extract_ha_commands(self, text):
        commands = []
        for match in re.findall(r'<HA_COMMAND>(.*?)</HA_COMMAND>', text, re.DOTALL):
            try:
                commands.append(json.loads(match.strip()))
            except json.JSONDecodeError:
                pass
        return commands

    def execute_ha_command(self, command):
        if not HA_TOKEN:
            print('⚠  HA command skipped: HA_ACCESS_TOKEN not set')
            return
        try:
            service = command.get('service', '')
            if '/' not in service and '.' not in service:
                return
            sep = '/' if '/' in service else '.'
            domain, svc = service.split(sep, 1)
            url = f'{HA_URL}/api/services/{domain}/{svc}'
            payload = {}
            if 'entity_id' in command:
                payload['entity_id'] = command['entity_id']
            if 'data' in command:
                payload.update(command['data'])
            resp = requests.post(
                url,
                headers={'Authorization': f'Bearer {HA_TOKEN}', 'Content-Type': 'application/json'},
                json=payload, timeout=5
            )
            resp.raise_for_status()
            print(f'✓ HA: {service} → {command.get("entity_id", "")}')
        except Exception as e:
            print(f'✗ HA command failed: {e}')

    def clean_response(self, text):
        return re.sub(r'<HA_COMMAND>.*?</HA_COMMAND>', '', text, flags=re.DOTALL).strip()

    # --- TTS / Audio ---

    def tts(self, text):
        resp = requests.post(
            f'https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}',
            headers={'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
            json={
                'text': text,
                'model_id': ELEVENLABS_MODEL,
                'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75, 'speed': ELEVENLABS_SPEED},
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.content

    def play_mp3(self, audio_bytes):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            f.write(audio_bytes)
            tmp = f.name
        try:
            subprocess.run(['mpg123', '-a', SPEAKER_DEVICE, '-q', tmp], check=True)
        except Exception as e:
            print(f'✗ Playback error: {e}')
        finally:
            os.unlink(tmp)

    def cleanup(self):
        if self.audio_input:
            self.audio_input.close()
        print('✓ Cleanup complete')


def main():
    signal.signal(signal.SIGTERM, lambda sig, frame: (_ for _ in ()).throw(KeyboardInterrupt()))

    if not LLM_PROVIDERS:
        print('ERROR: No LLM provider configured. Set OPENAI_BASE_URL, GOOGLE_API_KEY, or GROQ_API_KEY in .env')
        return
    if not ELEVENLABS_API_KEY:
        print('ERROR: ELEVENLABS_API_KEY not set in .env')
        return

    client = MegatronClient()
    client.initialize()
    client.listen_for_wake_word()


if __name__ == '__main__':
    main()
