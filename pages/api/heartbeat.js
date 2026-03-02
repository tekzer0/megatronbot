/**
 * Heartbeat API route.
 * This endpoint is designed to be a lightweight health check,
 * returning a simple status without touching the database or
 * performing any heavy operations. It should be safe to call frequently
 * for monitoring purposes.
 */
// This is a lightweight heartbeat endpoint intended for monitoring tools (e.g., k8s liveness probes).
// It must NOT import any code that touches the database or performs heavy operations.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
