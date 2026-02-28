---
name: Telegram Voice Reply
description: Allows the agent to send voice messages via Telegram using ElevenLabs.
tags:
  - communication
  - telegram
  - voice
  - elevenlabs
depends:
  - ELEVENLABS_API_KEY
  - ELEVENLABS_VOICE_ID
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_CHAT_ID
---

# Telegram Voice Reply Skill

This skill enables the agent to send voice messages in a Telegram chat. It utilizes ElevenLabs for text-to-speech conversion and the Telegram Bot API to send the resulting audio.

## Usage

To use this skill, simply call the `speak.sh` script with the desired text as an argument:

```bash
{baseDir}/speak.sh "Your message here."
```

The script will convert the text to speech using ElevenLabs and send it as a voice message to the Telegram chat specified by `TELEGRAM_CHAT_ID` using the `TELEGRAM_BOT_TOKEN`.

## Configuration

Ensure the following environment variables are set in your `.env` file:

-   `ELEVENLABS_API_KEY`: Your API key for ElevenLabs.
-   `ELEVENLABS_VOICE_ID`: The ID of the voice you want to use from ElevenLabs.
-   `TELEGRAM_BOT_TOKEN`: Your Telegram bot token.
-   `TELEGRAM_CHAT_ID`: The ID of the Telegram chat where the voice messages should be sent.
