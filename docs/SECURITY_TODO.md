# Security Hardening Plan — Next.js App (Internet-Facing)

## Context

The Event Handler Next.js application (`api/index.js`) is deployed to the public internet. It handles webhook ingress (Telegram, GitHub, generic), job creation via GitHub API, and Claude API calls — all expensive or sensitive operations. This audit identified critical gaps that must be closed before exposure.

---

## 1. Rate Limiting (CRITICAL)

**Problem:** Zero rate limiting on any endpoint. An attacker can spam job creation (GitHub API + Docker runs), Telegram message processing (Claude API calls), or brute-force the API key.

**File:** `api/index.js`

**Changes:**
- Add rate limiting via Next.js middleware or per-handler logic (Next.js does not use Express middleware)
- Add stricter per-endpoint limits:
  - `/api/create-job` — 10 req/min (creates expensive Docker jobs)
  - `/api/telegram/webhook` — 30 req/min (triggers Claude API calls)
  - `/api/github/webhook` — 20 req/min
  - `/api/jobs/status` — 30 req/min

**Note:** Since this is a Next.js app (not Express), rate limiting needs a Next.js-compatible approach. Options include:
- Next.js middleware (`middleware.js`) with an in-memory or Redis-backed store
- Per-handler rate limiting using a library like `rate-limiter-flexible`
- Edge middleware for deployment platforms like Vercel

---

## 2. Constant-Time API Key Comparison (CRITICAL)

**Problem:** `req.headers['x-api-key'] !== API_KEY` is vulnerable to timing attacks.

**File:** `api/index.js`

**Change:** Replace string `!==` with `crypto.timingSafeEqual`:

```js
const crypto = require('crypto');

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
```

Apply the same fix to Telegram secret check and GitHub webhook secret check.

---

## 3. Enforce Webhook Secrets (CRITICAL)

**Problem:** Both `TELEGRAM_WEBHOOK_SECRET` and `GH_WEBHOOK_SECRET` are optional. If unset, anyone can POST to these endpoints and trigger expensive API calls.

**File:** `api/index.js`

**Changes:**
- If `TELEGRAM_WEBHOOK_SECRET` is not set, reject all `/api/telegram/webhook` requests (log a startup warning)
- If `GH_WEBHOOK_SECRET` is not set, reject all `/api/github/webhook` requests (log a startup warning)
- Use `safeCompare` for both (from fix #2)

---

## 4. Request Body Size Limit (HIGH)

**Problem:** Request body size should be explicitly limited to prevent oversized payloads.

**File:** `api/index.js`

**Change:** Next.js API routes handle body parsing automatically. To limit body size, configure the route segment config:

```js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50kb',
    },
  },
};
```

Or validate body size manually in the POST handler.

---

## 5. Job Description Validation (HIGH)

**Problem:** No length or type validation on the `job` field from `/api/create-job`. Could create huge files via GitHub API.

**File:** `api/index.js`

**Changes:**
- Validate `job` is a string
- Enforce max length (e.g., 10,000 chars)

```js
if (!job || typeof job !== 'string') return Response.json({ error: 'Missing or invalid job field' }, { status: 400 });
if (job.length > 10000) return Response.json({ error: 'Job description too long' }, { status: 400 });
```

---

## 6. Fix Shell Injection in entrypoint.sh (CRITICAL)

**Problem:** `eval $(echo "$SECRETS_JSON" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')` is vulnerable to command injection if any secret value contains `$(...)`, backticks, or other shell metacharacters.

**File:** `docker/entrypoint.sh`

**Change:** Use `jq` to produce `key=value` pairs and `export` them without `eval`:

```bash
if [ -n "$SECRETS" ]; then
    SECRETS_JSON=$(printf '%s' "$SECRETS" | base64 -d)
    while IFS='=' read -r key value; do
        export "$key"="$value"
    done < <(printf '%s' "$SECRETS_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value)"')
    export SECRETS="$SECRETS_JSON"
fi
```

Apply the same pattern to the `LLM_SECRETS` block.

---

## 7. Fix Command Injection in Cron (HIGH)

**Problem:** `execAsync(command, { cwd: CRON_DIR })` uses `child_process.exec()` which spawns a shell. While CRONS.json is developer-controlled today, this is a defense-in-depth issue.

**File:** `lib/cron.js`

**Change:** Use `execFile` with explicit shell and validate that CRONS.json is not writable by agents (already enforced by `ALLOWED_PATHS=/logs` in auto-merge). Add a command length limit:

```js
const { execFile } = require('child_process');
// ...
if (command.length > 1000) throw new Error('Command too long');
const { stdout, stderr } = await new Promise((resolve, reject) => {
  execFile('/bin/sh', ['-c', command], { cwd: CRON_DIR, timeout: 30000 },
    (err, stdout, stderr) => err ? reject(err) : resolve({ stdout, stderr }));
});
```

Note: `execFile` with `/bin/sh -c` still runs in a shell, but adding the `timeout` prevents runaway commands. The real protection is that CRONS.json lives in `config/` which is not in `ALLOWED_PATHS`, so agents cannot modify it.

---

## 8. Fix Path Prefix Matching in auto-merge.yml (HIGH)

**Problem:** `[[ "$file" == "$compare"* ]]` matches `logs` as a prefix, which means a file named `logs_malicious.js` would pass. Need a trailing `/` in the comparison.

**File:** `.github/workflows/auto-merge.yml`

**Change:**
```bash
compare="${prefix#/}"
# Ensure prefix comparison includes directory boundary
if [[ "$file" == "$compare"/* ]] || [[ "$file" == "$compare" ]]; then
```

---

## 9. Sanitize Error Messages (MEDIUM)

**Problem:** `github.js` throws `GitHub API error: ${res.status} ${error}` which includes raw API response text. This could leak internal details to callers.

**File:** `lib/tools/github.js`

**Change:** Log the full error, throw a generic one:
```js
if (!res.ok) {
  const error = await res.text();
  console.error(`GitHub API error: ${res.status} ${endpoint}`, error);
  throw new Error(`GitHub API error: ${res.status}`);
}
```

The error handler in `api/index.js` already catches unhandled errors and returns generic messages, so this is defense-in-depth.

---

## 10. Add Request Logging (MEDIUM)

**Problem:** No audit trail of who called what endpoint, when. Impossible to detect attacks or investigate incidents.

**File:** `api/index.js` or Next.js `middleware.js`

**Change:** Add minimal structured request logging. In a Next.js app, this can be done in the route handlers or via Next.js middleware:

```js
// In middleware.js or per-handler
console.log(JSON.stringify({
  method: req.method,
  path: req.nextUrl.pathname,
  status: response.status,
  ip: req.headers.get('x-forwarded-for') || req.ip,
}));
```

---

## 11. Restrict render_md to Repo Root (MEDIUM)

**Problem:** `render_md` resolves `{{ filepath }}` relative to the project root using `path.resolve()`, but doesn't verify the result stays within the project. A `{{ ../../../etc/shadow.md }}` include would resolve outside.

**File:** `lib/utils/render-md.js`

**Change:** Add a bounds check:
```js
const includeResolved = path.resolve(PROJECT_ROOT, includePath.trim());
if (!includeResolved.startsWith(PROJECT_ROOT)) {
  console.log(`[render_md] Path traversal blocked: ${includePath}`);
  return match;
}
```

---

## 12. Docker: Add Non-Root User (MEDIUM)

**Problem:** Container runs everything as root, including Chrome and the Pi agent.

**File:** `docker/Dockerfile`

**Change:** Add a non-root user after installing system dependencies:
```dockerfile
RUN useradd -m -u 1000 agent
# ... (keep installs as root) ...
USER agent
```

Note: This requires adjusting Chrome cache paths and the `/job` workdir ownership. Needs testing.

---

## 13. Pin pi-skills to Specific Commit (LOW)

**Problem:** `git clone https://github.com/badlogic/pi-skills.git` without a pinned commit means any upstream push changes what's in the Docker image.

**File:** `docker/Dockerfile`

**Change:**
```dockerfile
RUN git clone https://github.com/badlogic/pi-skills.git /pi-skills && \
    cd /pi-skills && git checkout <COMMIT_SHA>
```

---

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `api/index.js` | Rate limiting, timing-safe compare, enforce secrets, body size limit, job validation, request logging |
| `lib/cron.js` | Add command timeout and length limit |
| `lib/tools/github.js` | Sanitize error messages |
| `lib/utils/render-md.js` | Path traversal guard |
| `docker/entrypoint.sh` | Replace `eval` with safe env export loop |
| `.github/workflows/auto-merge.yml` | Fix path prefix matching with trailing `/` |
| `docker/Dockerfile` | Add non-root user, pin pi-skills commit |

---

## Verification

1. **Start server locally:** `npm run dev`
2. **Test rate limiting:** Send rapid requests to `/api/create-job` and verify 429 responses after limit
3. **Test auth:** Send requests without API key, with wrong key — verify 401
4. **Test webhook secrets:** Send to `/api/telegram/webhook` and `/api/github/webhook` without secrets — verify rejection
5. **Test job validation:** POST oversized `job` field — verify 400
6. **Test entrypoint:** Run `docker/entrypoint.sh` with secrets containing `$(echo pwned)` — verify no command execution
7. **Test auto-merge paths:** Create a PR with a file named `logs_evil.js` — verify it's blocked
8. **Test render_md:** Add `{{ ../../etc/passwd.md }}` to a test file — verify it's blocked
