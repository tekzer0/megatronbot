// This API route provides a lightweight heartbeat endpoint for monitoring purposes.
// It must remain free of heavy operations like database access or complex logic
// to ensure it responds quickly and without side effects.
export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
