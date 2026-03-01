// This API route provides a lightweight "heartbeat" or "health check" endpoint.
// It is designed to be called frequently by orchestrators (e.g., Docker, k8s, Render)
// to confirm the service is up without touching the database or performing heavy work.
//
// It MUST NOT import or call any code that triggers database initialization
// (e.g., from lib/db/, lib/tools/, etc.) to maintain its lightweight nature.

export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
