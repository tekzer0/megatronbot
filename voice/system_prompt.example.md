# Megatron Voice Assistant — Personalized System Prompt Extension
#
# Copy this file to system_prompt.md and customize for your setup.
# system_prompt.md is gitignored — your entity IDs and local details stay private.
#
# This content is appended to the base system prompt in voice.py.
# You can add any additional context, entity lists, or instructions here.

You know about: the bot on port 3000, a cloudflared tunnel, Home Assistant, and a local network.

KNOWN HOME ASSISTANT ENTITIES (use exact entity_id in commands, NEVER speak them):
Lights:
  light.living_room (Living Room)
  light.bedroom (Bedroom)
Switches:
  switch.fan (Fan)

# Add your own entity IDs from your Home Assistant instance.
# Find them at: Settings → Devices & Services → Entities in Home Assistant.
