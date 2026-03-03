// This API route provides a lightweight "heartbeat" or "health check" endpoint.
// It is designed to be called frequently by orchestrators (e.g., Docker, Kubernetes)
// to confirm service availability without touching the database or performing
// any heavy computations.
//
// DO NOT import or call any code that triggers database initialization (e.g.,
// from lib/db/, lib/tools/, etc.) or performs other resource-intensive operations.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
