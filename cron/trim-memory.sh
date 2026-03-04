#!/bin/bash
# Trim LangGraph conversation history — keeps last 30 messages per thread
# Prevents context overflow from accumulating indefinitely
# Runs weekly via cron

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB="$SCRIPT_DIR/../data/thepopebot.sqlite"

[ -f "$DB" ] || exit 0

python3 - "$DB" << 'PYEOF'
import sqlite3, json, sys

db_path = sys.argv[1]
KEEP = 30

db = sqlite3.connect(db_path)
cur = db.cursor()

cur.execute("SELECT DISTINCT thread_id FROM checkpoints")
threads = [r[0] for r in cur.fetchall()]

for thread in threads:
    cur.execute("SELECT checkpoint_id, checkpoint FROM checkpoints WHERE thread_id=? ORDER BY checkpoint_id DESC LIMIT 1", (thread,))
    row = cur.fetchone()
    if not row:
        continue

    latest_id, checkpoint_json = row
    try:
        data = json.loads(checkpoint_json)
        msgs = data.get('channel_values', {}).get('messages', [])
        if len(msgs) > KEEP:
            data['channel_values']['messages'] = msgs[-KEEP:]
            cur.execute("UPDATE checkpoints SET checkpoint=? WHERE thread_id=? AND checkpoint_id=?",
                (json.dumps(data), thread, latest_id))
            print(f"Trimmed thread {thread}: {len(msgs)} → {KEEP} messages")
    except Exception as e:
        print(f"Error trimming {thread}: {e}")

    cur.execute("DELETE FROM checkpoints WHERE thread_id=? AND checkpoint_id!=?", (thread, latest_id))
    cur.execute("DELETE FROM writes WHERE thread_id=? AND checkpoint_id!=?", (thread, latest_id))

db.commit()
db.close()
print("Memory trim complete")
PYEOF
