/**
 * @file API route for a lightweight heartbeat check.
 * This endpoint must remain DB-free and avoid heavy operations
 * to serve as a quick health check for orchestrators and monitoring tools.
 */
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
