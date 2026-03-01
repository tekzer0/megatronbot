// This API route provides a lightweight "heartbeat" or health check endpoint.
// It should remain free of any heavy operations like database initialization
// to ensure it can be called frequently by monitoring tools without overhead.

export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
