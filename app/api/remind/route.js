import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const REMINDERS_FILE = path.join(process.cwd(), 'data', 'reminders.json');

function readReminders() {
  try {
    if (!fs.existsSync(REMINDERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeReminders(reminders) {
  fs.mkdirSync(path.dirname(REMINDERS_FILE), { recursive: true });
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

// POST /api/remind — add a reminder
// Body: { message: string, at: ISO string or Unix timestamp (seconds) }
export async function POST(request) {
  try {
    const body = await request.json();
    const { message, at } = body;

    if (!message || at === undefined) {
      return NextResponse.json({ error: 'message and at are required' }, { status: 400 });
    }

    // Accept Unix timestamp (number) or ISO string
    const ts = typeof at === 'number' ? at : Math.floor(new Date(at).getTime() / 1000);
    if (isNaN(ts)) {
      return NextResponse.json({ error: 'Invalid at value — use ISO string or Unix timestamp' }, { status: 400 });
    }

    const reminders = readReminders();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    reminders.push({ id, message, at: ts });
    writeReminders(reminders);

    console.log(`[remind] Scheduled: "${message}" at ${new Date(ts * 1000).toISOString()}`);
    return NextResponse.json({ ok: true, id, at: new Date(ts * 1000).toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/remind — list pending reminders
export async function GET() {
  const reminders = readReminders().map(r => ({
    ...r,
    at_human: new Date(r.at * 1000).toISOString(),
  }));
  return NextResponse.json(reminders);
}
