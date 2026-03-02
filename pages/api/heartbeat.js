// This API route is designed to be a lightweight health check endpoint.
// It should not import or call any code that triggers database initialization
// or performs heavy work, to ensure it's safe to call frequently for monitoring.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
