// This is a lightweight heartbeat endpoint for monitoring purposes.
// It must remain free of any database imports or heavy operations
// to ensure it can be called frequently without overhead.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
