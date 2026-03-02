/**
 * Heartbeat endpoint for health checks (e.g., by orchestrators like Docker, k8s, Render).
 * This endpoint must remain lightweight and DB-free for monitoring purposes.
 * It should not import or call any code that triggers DB initialization
 * or performs any heavy work, ensuring it's safe for frequent monitoring checks.
 */
// This endpoint must remain lightweight and DB-free for monitoring purposes.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
