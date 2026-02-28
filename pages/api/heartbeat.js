/**
 * Heartbeat API endpoint for health checks.
 * This endpoint must remain lightweight and avoid importing any modules
 * that trigger database initialization or other heavy operations,
 * making it safe to call frequently by monitoring tools.
 */
export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
