// This endpoint is a lightweight health check that should remain
// free of any heavy operations like database initialization or calls
// to other services, to ensure it's safe to call frequently for monitoring.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
