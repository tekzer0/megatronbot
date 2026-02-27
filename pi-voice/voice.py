#!/usr/bin/env python3
"""
Megatron Voice Assistant — Oracle1 (Pi 5)
Based on oracle_client.py — ReSpeaker XVF3800 4-Mic (card 0)

Wake word detection: faster-whisper on short chunks (no Porcupine, no .ppn files, no renewals)
STT: faster-whisper base (on-device)
LLM: Groq Kimi-K2
TTS: ElevenLabs → mpg123
HA: direct REST API calls (same approach as oracle_client_ollama.py)
"""

import os
import io
import re
import json
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

load_dotenv(os.path.expanduser('~/mybot/.env'))
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

GROQ_API_KEY        = os.environ.get('GROQ_API_KEY', '')
ELEVENLABS_API_KEY  = os.environ.get('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'YOq2y2Up4RgXP2HyXjE5')
ELEVENLABS_MODEL    = 'eleven_flash_v2_5'
ELEVENLABS_SPEED    = 1.15
KIMI_MODEL          = 'moonshotai/kimi-k2-instruct'
HA_URL              = os.environ.get('HA_URL', 'http://192.168.1.210:8123')
HA_TOKEN            = os.environ.get('HA_ACCESS_TOKEN', '')

WAKE_WORD           = 'megatron'
# Whisper tiny sometimes transcribes it differently — catch all variants
WAKE_ALIASES        = ['megatron', 'mega tron', 'mega-tron', 'megaton', 'meg a tron']
WHISPER_WAKE_SIZE   = 'tiny'    # fast, just needs to catch one word
WHISPER_STT_SIZE    = 'base'    # better accuracy for actual commands

# ReSpeaker XVF3800 is now on card 0 (was card 2 previously)
RESPEAKER_CARD      = 0
RESPEAKER_DEVICE    = 'plughw:0,0'
SPEAKER_DEVICE      = 'plughw:0,0'

CHANNELS            = 2         # ReSpeaker outputs beamformed 2-channel
SAMPLE_RATE         = 16000
CHUNK_SIZE          = 512

# VAD — looser values to avoid cutting off speech mid-sentence
SILENCE_THRESHOLD   = 300
SILENCE_DURATION    = 2.0
MAX_RECORD_SECONDS  = 12

# Wake word chunk duration (seconds of audio per Whisper check)
WAKE_CHUNK_SECONDS  = 2

SYSTEM_PROMPT = """You are Megatron, a voice assistant running locally on Oracle1 (Raspberry Pi 5).
Keep responses brief and natural — spoken aloud, 1-2 sentences max unless more is needed.
You know about: popebot on port 3000, cloudflared tunnel to megatron.chemical-valley.com,
Home Assistant at 192.168.1.210, Ollama at 192.168.1.190, OLED display, local network 192.168.1.x.

CRITICAL RULES:
- NEVER speak entity IDs, service names, JSON, or any technical details aloud.
- NEVER say words like "entity_id", "service", "light.turn_off", "switch.sonoff", "HA_COMMAND" out loud.
- Your spoken reply must sound 100% natural — like a human assistant confirming an action.
- Good: "Done, hallway lights are off." Bad: "Calling service light.turn_off on entity light.hallway."

KNOWN HOME ASSISTANT ENTITIES (use exact entity_id in commands, NEVER speak them):
Lights:
  light.hallway (Hallway), light.hall_1 (Hall 1), light.hall_2 (Hall 2)
  light.bedroom (Bedroom), light.bed_lamp_2 (Bed lamp 2)
  light.table (table), light.ben_wah (ben wah)
  light.deck_floodlight_floodlight (Deck Floodlight)
  light.bedroom_switch (big)
Switches:
  switch.sonoff_1000b50b30 (Bathroom light)
  switch.sonoff_100028cd72 (k light), switch.sonoff_1000481c66_1/2 (klight)
  switch.sonoff_1000216191 (overhead)
  switch.deck_floodlight_power (Deck Floodlight Power)
  switch.pihole (Pi-hole)

When controlling devices, output the command tag FIRST (silent — never read aloud), then your natural spoken reply:
<HA_COMMAND>{"service": "light.turn_off", "entity_id": "light.hallway"}</HA_COMMAND>
Done, hallway lights are off.

Multiple commands allowed. Spoken reply goes AFTER all command tags, always natural language only.
"""


class MegatronClient:
    def __init__(self):
        self.audio_input    = None
        self.whisper_wake   = None
        self.whisper_stt    = None
        self.audio_buffer   = []
        self.history        = []

    def configure_respeaker_gain(self):
        """Optimize ReSpeaker microphone gain for better voice pickup"""
        try:
            print('Configuring ReSpeaker microphone gain...')
            subprocess.run(
                ['amixer', '-c', str(RESPEAKER_CARD), 'set', 'Capture', '85%'],
                capture_output=True
            )
            subprocess.run(
                ['amixer', '-c', str(RESPEAKER_CARD), 'set', 'ADC PCM', '85%'],
                capture_output=True
            )
            print('✓ Microphone gain optimized')
        except Exception as e:
            print(f'⚠  Could not auto-configure gain: {e}')

    def initialize(self):
        print('=' * 60)
        print('Megatron Voice Assistant — Oracle1')
        print('=' * 60)

        self.configure_respeaker_gain()

        # Load Whisper models
        print(f'Loading Whisper {WHISPER_WAKE_SIZE} (wake word)...')
        self.whisper_wake = WhisperModel(WHISPER_WAKE_SIZE, device='cpu', compute_type='float32')

        print(f'Loading Whisper {WHISPER_STT_SIZE} (transcription)...')
        self.whisper_stt = WhisperModel(WHISPER_STT_SIZE, device='cpu', compute_type='float32')

        # Initialize audio input
        self.audio_input = alsaaudio.PCM(
            alsaaudio.PCM_CAPTURE,
            alsaaudio.PCM_NORMAL,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            format=alsaaudio.PCM_FORMAT_S16_LE,
            periodsize=CHUNK_SIZE,
            device=RESPEAKER_DEVICE
        )

        print(f'✓ Wake word: "{WAKE_WORD}" (Whisper-based, no .ppn files)')
        print(f'✓ ReSpeaker XVF3800 on card {RESPEAKER_CARD}')
        print(f'✓ LLM: {KIMI_MODEL}')
        print(f'✓ TTS: ElevenLabs {ELEVENLABS_VOICE_ID}')
        print('=' * 60)

    def audio_chunks_to_float(self, chunks, channels=CHANNELS):
        """Convert raw audio chunks to float32 mono array for Whisper"""
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
        """Play a short 0.2s tone via aplay so user knows to speak"""
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
        """Continuously buffer audio and check for wake word using Whisper tiny.
        If the wake chunk contains content after 'megatron', use it directly.
        Otherwise play a beep and record the next utterance.
        """
        print(f'\nListening for "{WAKE_WORD}"...\n')
        # Rolling buffer: keep 3s of audio, check every 2s (overlap catches words at chunk edges)
        wake_buffer = []
        chunk_step   = int(WAKE_CHUNK_SECONDS * SAMPLE_RATE / CHUNK_SIZE)   # chunks per 2s
        chunk_window = int(3 * SAMPLE_RATE / CHUNK_SIZE)                    # keep 3s total
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
                    wake_buffer = wake_buffer[-chunk_window:]   # keep only last 3s

                chunks_since_check += 1
                if chunks_since_check < chunk_step:
                    continue
                chunks_since_check = 0

                audio_float = self.audio_chunks_to_float(wake_buffer)

                text = self.transcribe_with_model(
                    self.whisper_wake, audio_float,
                    prompt='Megatron'
                )

                # Filter out common Whisper hallucinations on silence/background noise
                tclean = text.strip().lower().rstrip('.')
                HALLUCINATIONS = {
                    '', 'megatron', 'thank you', 'thanks', 'music playing',
                    'music', '...', '.. ..', 'you', 'the', 'bye', 'bye bye',
                    'please subscribe', 'subscribe', 'subtitles by',
                }
                is_hallucination = tclean in HALLUCINATIONS or tclean.startswith('♪')
                if tclean and not is_hallucination:
                    print(f'  heard: "{text.strip()}"')

                tl = text.lower()
                if not is_hallucination and any(alias in tl for alias in WAKE_ALIASES):
                    print(f'\n🎤 "{WAKE_WORD}" detected! [{datetime.now().strftime("%H:%M:%S")}]')
                    wake_buffer = []   # reset buffer after detection

                    # Check if command was spoken in the same breath as wake word
                    after_wake = tl
                    for alias in WAKE_ALIASES:
                        if alias in tl:
                            after_wake = tl.split(alias, 1)[-1].strip(' .,!?')
                            break
                    if len(after_wake) > 3:
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
        """Calculate RMS energy of an audio chunk for VAD"""
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        return np.sqrt(np.mean(np.abs(audio_array.astype(np.float32)) ** 2))

    def record_and_respond(self):
        """Record command with VAD then transcribe and respond"""
        print('📝 Recording (stops when you stop talking)...')
        self.audio_buffer = []

        silence_chunks = 0
        silence_needed = int(SILENCE_DURATION * SAMPLE_RATE / CHUNK_SIZE)
        max_chunks     = int(MAX_RECORD_SECONDS * SAMPLE_RATE / CHUNK_SIZE)

        for i in range(max_chunks):
            length, data = self.audio_input.read()
            if length <= 0:
                continue

            self.audio_buffer.append(data)
            energy = self.calculate_audio_energy(data)

            if energy < SILENCE_THRESHOLD:
                silence_chunks += 1
                if silence_chunks >= silence_needed:
                    print(f'✓ Stopped (silence after {i * CHUNK_SIZE / SAMPLE_RATE:.1f}s)')
                    break
            else:
                silence_chunks = 0

        # Transcribe
        print('🔄 Transcribing...')
        t0 = datetime.now()
        audio_float   = self.audio_chunks_to_float(self.audio_buffer)
        transcription = self.transcribe_with_model(
            self.whisper_stt, audio_float,
            prompt='Smart home voice commands. Clear speech.'
        )
        print(f'✓ ({(datetime.now()-t0).total_seconds():.2f}s): "{transcription}"')

        if not transcription:
            print('✗ No speech detected')
            return

        self.process_transcription(transcription)

    def process_transcription(self, transcription):
        """Send transcription to LLM, execute HA commands, speak response.
        If response ends with a question, auto-listen for reply without wake word.
        """
        # LLM
        print('🤖 Processing...')
        t0 = datetime.now()
        response_text = self.chat(transcription)
        print(f'✓ ({(datetime.now()-t0).total_seconds():.1f}s)')

        # Execute any HA commands
        ha_commands = self.extract_ha_commands(response_text)
        for cmd in ha_commands:
            self.execute_ha_command(cmd)

        spoken = self.clean_response(response_text)
        if spoken:
            print(f'Megatron: {spoken}')
            audio_bytes = self.tts(spoken)
            self.play_mp3(audio_bytes)

            # If response was a question, auto-listen for reply (no wake word needed)
            if spoken.rstrip().endswith('?'):
                print('  (question asked — listening for reply...)')
                self.record_and_respond()

        print('-' * 60)

    # --- LLM ---

    def chat(self, user_text):
        self.history.append({'role': 'user', 'content': user_text})
        messages = [{'role': 'system', 'content': SYSTEM_PROMPT}] + self.history[-10:]
        resp = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {GROQ_API_KEY}', 'Content-Type': 'application/json'},
            json={'model': KIMI_MODEL, 'messages': messages, 'max_tokens': 400},
            timeout=30,
        )
        resp.raise_for_status()
        reply = resp.json()['choices'][0]['message']['content']
        self.history.append({'role': 'assistant', 'content': reply})
        return reply

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
        try:
            service = command.get('service', '')
            if '/' not in service and '.' not in service:
                return
            # Support both "light/turn_on" and "light.turn_on" formats
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
    # Handle SIGTERM from systemd gracefully (raises KeyboardInterrupt in main thread)
    signal.signal(signal.SIGTERM, lambda sig, frame: (_ for _ in ()).throw(KeyboardInterrupt()))

    if not GROQ_API_KEY:
        print('ERROR: GROQ_API_KEY not set in ~/mybot/.env')
        return
    if not ELEVENLABS_API_KEY:
        print('ERROR: ELEVENLABS_API_KEY not set in ~/mybot/.env')
        return

    client = MegatronClient()
    client.initialize()
    client.listen_for_wake_word()


if __name__ == '__main__':
    main()
