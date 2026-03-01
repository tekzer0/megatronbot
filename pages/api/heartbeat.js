// This endpoint is a lightweight "health check" for orchestrators (e.g., Docker, k8s, Render).
// It must remain lightweight and DB-free for monitoring purposes.
// Do not import or call any code that triggers database initialization or heavy work.

export default function handler(request, response) {
  // This endpoint must remain lightweight and DB-free for monitoring purposes.

  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
