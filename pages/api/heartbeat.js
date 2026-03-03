// This endpoint is designed to be a lightweight health check.
// It must not import or call any code that triggers database initialization
// or performs any heavy/blocking operations, ensuring it's safe to call
// frequently for monitoring purposes.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
