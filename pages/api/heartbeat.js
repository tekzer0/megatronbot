/**
 * Heartbeat endpoint for health checks.
 * This endpoint must remain lightweight and must not interact with the database
 * or perform any heavy operations to serve its purpose for monitoring tools.
 */
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
