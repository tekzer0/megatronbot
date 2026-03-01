export default function handler(request, response) {
  // This endpoint is for lightweight health checks and must remain DB-free
  // and avoid heavy operations to ensure it can be called frequently for monitoring.

  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
