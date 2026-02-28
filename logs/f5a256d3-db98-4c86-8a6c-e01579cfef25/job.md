Build a fully-offline, local-calendar skill for the agent:

1. Create `pi-skills/local-calendar/` with:
   - `SKILL.md` (front-matter + usage docs)
   - `calendar.ics` starter file in `~/.local/share/`
   - `add-apt.sh` – bash script that takes "Title, YYYY-MM-DD HH:MM" and appends a VEVENT to the ics file
   - `list-today.sh` – prints today’s events
   - `list-week.sh` – prints next 7 days
   - `del-event.sh` – removes by UID
   All scripts chmod +x and 100% local (no cloud, no fees)

2. Activate: `ln -s ../../pi-skills/local-calendar .pi/skills/local-calendar`

3. Check if HA has a calendar.* entity; if so, create `sync-from-ha.sh` that pulls events into the local ics file

4. Test each script manually, then commit

Keep everything self-contained so the agent can handle appointments offline.