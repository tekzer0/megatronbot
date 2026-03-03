// This route is designed to be a lightweight health check endpoint.
// It must not import or call any code that triggers database initialization
// or performs any heavy work, to ensure it can be called frequently by
// monitoring tools without overhead.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
