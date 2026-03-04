// This is a lightweight heartbeat endpoint for monitoring purposes.
// It must not import or call any code that triggers database initialization
// or performs any heavy work. This endpoint is safe to call frequently.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
