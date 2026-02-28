/**
 * Heartbeat endpoint
 *
 * This route provides a lightweight health‑check that never touches the database
 * or performs any heavy work. It is safe to be called frequently by monitoring
 * tools (e.g., every few seconds) and should always return a 200 status with a
 * minimal JSON payload.
 *
 * IMPORTANT: Do NOT import any modules that may initialize the DB (e.g.,
 * lib/db/, lib/tools/, etc.). Keeping this endpoint DB‑free ensures it remains
 * fast and does not interfere with other services.
 */

export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
/**
 * Heartbeat endpoint
 *
 * This route provides a lightweight health‑check that never touches the database
 * or performs any heavy work. It is safe to be called frequently by monitoring
 * tools (e.g., every few seconds) and should always return a 200 status with a
 * minimal JSON payload.
 *
 * IMPORTANT: Do NOT import any modules that may initialize the DB (e.g.,
 * lib/db/, lib/tools/, etc.). Keeping this endpoint DB‑free ensures it remains
 * fast and does not interfere with other services.
 */

export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
