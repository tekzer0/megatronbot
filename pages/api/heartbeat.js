// This is a lightweight heartbeat endpoint for monitoring purposes.
// It must not import any modules that trigger database initialization
// or perform any heavy work. This endpoint is safe to call frequently.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
