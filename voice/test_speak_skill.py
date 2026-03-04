import os
import requests
import tempfile
import sys
from datetime import datetime

# --- Paths ---
# This script's directory (e.g., /job/voice)
_VOICE_DIR = os.path.dirname(os.path.abspath(__file__))
# Project root directory (e.g., /job)
_PROJECT_DIR = os.path.dirname(_VOICE_DIR)

# Add the project directory to sys.path to allow importing voice.voice
sys.path.insert(0, _PROJECT_DIR)

# --- Config loading (adapted from voice/voice.py for consistency) ---
def load_dotenv(path):
    """
    Loads environment variables from a .env file into os.environ.
    Only sets variables if they are not already present in os.environ.
    """
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, val = line.partition('=')
                # Use setdefault to mimic the behavior where voice/.env overrides
                # project root .env, and existing shell env vars are not overridden.
                os.environ.setdefault(key, val)
    except FileNotFoundError:
        pass

# Load project root .env first, then voice-local .env (takes precedence)
load_dotenv(os.path.join(_PROJECT_DIR, '.env'))
load_dotenv(os.path.join(_VOICE_DIR, '.env'))

# Now get the values from os.environ, replicating how voice/voice.py gets them
# Note ELEVENLABS_MODEL is hardcoded in voice/voice.py, not from os.environ by default.
ELEVENLABS_API_KEY  = os.environ.get('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'YOq2y2Up4RgXP2HyXjE5')
ELEVENLABS_MODEL    = 'eleven_flash_v2_5' # Hardcoded default as in voice/voice.py
ELEVENLABS_SPEED    = float(os.environ.get('ELEVENLABS_SPEED', '1.15'))

TELEGRAM_BOT_TOKEN  = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID    = os.environ.get('TELEGRAM_CHAT_ID', '')

# --- Masking helper ---
def mask_secret(value, chars_to_show=4):
    """Masks a secret value for logging."""
    if not value:
        return "[NOT SET]"
    # If the value is very short, just indicate it's set without revealing parts
    if len(value) <= 2 * chars_to_show:
        return "[SET]"
    return f"{value[:chars_to_show]}...{value[-chars_to_show:]}"

# --- Main Test Logic ---
def run_speak_skill_test():
    print("--- Speak Skill Test Report ---")
    print(f"Timestamp: {datetime.now().isoformat()}")

    # 1. Environment Variable Check
    print("\n1. Environment Variable Status:")
    env_vars_to_check = {
        "ELEVENLABS_API_KEY": ELEVENLABS_API_KEY,
        "ELEVENLABS_VOICE_ID": ELEVENLABS_VOICE_ID,
        "ELEVENLABS_MODEL": ELEVENLABS_MODEL,
        "ELEVENLABS_SPEED": ELEVENLABS_SPEED,
        "TELEGRAM_BOT_TOKEN": TELEGRAM_BOT_TOKEN,
        "TELEGRAM_CHAT_ID": TELEGRAM_CHAT_ID,
    }

    missing_critical_env = []
    for name, value in env_vars_to_check.items():
        if name in ["ELEVENLABS_API_KEY", "TELEGRAM_BOT_TOKEN"]:
            print(f"  - {name}: {mask_secret(value)}")
        else:
            print(f"  - {name}: {'[SET]' if value else '[NOT SET]'}")

        if not value and name in ["ELEVENLABS_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]:
            missing_critical_env.append(name)

    if missing_critical_env:
        print(f"\nERROR: The following critical environment variables are NOT SET: {', '.join(missing_critical_env)}")
        print("Please ensure they are configured in your .env files (project root .env or voice/.env).")
        return

    # Importing MegatronClient from voice.voice after environment is loaded
    # The tts method does not depend on audio input/output hardware, so `initialize()` is not needed.
    try:
        from voice.voice import MegatronClient
    except ImportError as e:
        print(f"\nERROR: Could not import MegatronClient from voice.voice. Is voice/voice.py present and Python path correct? Error: {e}")
        return
    except Exception as e:
        print(f"\nERROR: An unexpected error occurred during MegatronClient import: {e}")
        return

    client = MegatronClient()
    test_phrase = 'Hello from your assistant. This is a voice test.'
    print(f"\n2. Attempting Voice Message: '{test_phrase}'")
    audio_bytes = None

    try:
        # Call the existing tts method
        audio_bytes = client.tts(test_phrase)
        print("  - ElevenLabs TTS: SUCCESS - Audio generated.")
    except requests.exceptions.RequestException as e:
        print(f"  - ElevenLabs TTS: FAILED. Network or API error: {e}")
        print("    (Check ELEVENLABS_API_KEY and network connectivity to ElevenLabs.)")
        return
    except Exception as e:
        print(f"  - ElevenLabs TTS: FAILED. Unexpected error during TTS generation: {e}")
        return

    if not audio_bytes:
        print("  - ElevenLabs TTS: FAILED. No audio bytes received, even without error.")
        return

    print("  - Attempting to send audio to Telegram...")
    telegram_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVoice"
    
    # Telegram API expects a file-like object for voice messages.
    # Using NamedTemporaryFile is good practice for managing temporary files.
    temp_audio_file = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            f.write(audio_bytes)
            temp_audio_file = f.name
        
        with open(temp_audio_file, 'rb') as audio_payload:
            files = {'voice': ('voice_test.mp3', audio_payload, 'audio/mpeg')}
            data = {'chat_id': TELEGRAM_CHAT_ID}

            telegram_resp = requests.post(telegram_url, data=data, files=files, timeout=30)
            telegram_resp.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            telegram_json = telegram_resp.json()

            if telegram_json.get('ok'):
                print("  - Telegram Voice Message: SUCCESS")
                print("    (Please check the Telegram chat specified by TELEGRAM_CHAT_ID for the voice message.)")
            else:
                print(f"  - Telegram Voice Message: FAILED. API response error: {telegram_json.get('description', 'Unknown error')}")
                print(f"    (Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for correctness and permissions.)")
    except requests.exceptions.RequestException as e:
        print(f"  - Telegram Voice Message: FAILED. Network or API error: {e}")
        print("    (Check Telegram Bot Token, Chat ID, and network connectivity to Telegram.)")
    except Exception as e:
        print(f"  - Telegram Voice Message: FAILED. Unexpected error during Telegram send: {e}")
    finally:
        if temp_audio_file and os.path.exists(temp_audio_file):
            os.unlink(temp_audio_file) # Clean up the temporary file

    print("\n--- Test Complete ---")


if __name__ == '__main__':
    run_speak_skill_test()
