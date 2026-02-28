// This API route provides a lightweight "heartbeat" or health check endpoint.
// It is designed to be called frequently by monitoring tools (e.g., Docker, Kubernetes, Render)
// to confirm the service is up without touching the database or performing heavy work.
//
// DO NOT import or call any code that triggers database initialization or other
// resource-intensive operations from this file.
// This endpoint must remain lightweight and DB-free for monitoring purposes.
export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
// This API route provides a lightweight "heartbeat" or health check endpoint.
// It is designed to be called frequently by monitoring tools (e.g., Docker, Kubernetes, Render)
// to confirm the service is up without touching the database or performing heavy work.
//
// DO NOT import or call any code that triggers database initialization or other
// resource-intensive operations from this file.
// This endpoint must remain lightweight and DB-free for monitoring purposes.
export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
