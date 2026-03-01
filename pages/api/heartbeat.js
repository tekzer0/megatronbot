// This API route provides a lightweight "heartbeat" endpoint
// It must remain lightweight and DB-free for monitoring purposes.
// Do not import or call any code that triggers DB initialization (e.g., from lib/db/, lib/tools/).

export default function handler(request, response) {
  // Only allow GET requests; other methods are not supported for a heartbeat.
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return a simple JSON payload indicating the service is alive.
  response.status(200).json({ status: 'ok' });
}
