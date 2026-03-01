// This API route is a lightweight heartbeat endpoint used for monitoring the service's liveness.
// It must remain free of any heavy operations, especially database interactions, to ensure quick
// and reliable responses for frequent health checks from orchestrators like Docker, k8s, etc.
export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
