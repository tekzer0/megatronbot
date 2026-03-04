// This API route provides a lightweight health check for orchestrators.
// It must remain free of any database imports or heavy computations
// to ensure it can be called frequently without overhead.
// This is a lightweight heartbeat endpoint.
// It must remain free of any heavy operations or database interactions
// to serve its purpose for frequent monitoring checks.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
