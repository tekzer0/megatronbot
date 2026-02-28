# Heartbeat Implementation Tasks

## Background
Users want a lightweight “health check” endpoint so orchestrators (e.g. Docker‐desktop, k8s, Render, etc.) can confirm the service is up without touching the DB or triggering heavy work. We already expose

GET /api/version
which returns
{ version: <string>, updateAvailable: <bool> }

That endpoint currently runs a DB query (to read settings.update) and therefore opens the DB file. We need to keep that endpoint as-is for admin UI checks, but add a cheaper endpoint that does none of that work.

## Goals
1. Add a new endpoint GET /api/heartbeat that returns HTTP 200 and a small JSON payload without ever opening the DB or doing any heavy work.
2. The endpoint should be safe to call frequently, even from monitoring tools that hit it every few seconds.
3. Do not break the existing /api/version endpoint.

## Tasks
1. Create a new API route file pages/api/heartbeat.js (or the equivalent in the current routing style) that immediately sends a 200 status with JSON: { "status": "ok" }
2. Ensure this new route does not import or call any code that triggers DB initialization (e.g., do not import anything from lib/db/, lib/tools/, etc.).
3. Add a comment in the new route file explaining that it must remain lightweight and DB-free for monitoring purposes.
4. Optionally update any documentation strings to mention the new heartbeat endpoint, but don't break existing docs.

## Deliverables
- pages/api/heartbeat.js (or equivalent route file)
- (If applicable) update any README or config docs to mention the endpoint.
