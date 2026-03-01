// This API route provides a lightweight "heartbeat" or health check endpoint.
// It should remain entirely free of database operations or heavy computations
// to serve its purpose for frequent monitoring by orchestrators.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
