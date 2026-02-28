Create `pi-skills/telegram-voice/`:
1. `SKILL.md` – front-matter, usage `{baseDir}/speak.sh "text"`
2. `speak.sh` – bash script that:
   - grabs `$ELEVENLABS_API_KEY` and `$ELEVENLABS_VOICE_ID`
   - POST text to ElevenLabs /v1/text-to-speech → MP3
   - POST MP3 to Telegram `sendVoice` using `$TELEGRAM_BOT_TOKEN` and `$TELEGRAM_CHAT_ID`
   - cleans up temp files
3. Activate: `ln -s ../../pi-skills/telegram-voice .pi/skills/telegram-voice`
4. Test: `speak.sh "Voice replies are now live."` and confirm the voice message arrives in Telegram
5. Commit if successful