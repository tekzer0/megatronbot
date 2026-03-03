// This is a lightweight heartbeat endpoint for health checks.
// It must remain free of any database operations or heavy processing.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
