// This is a lightweight "health check" endpoint for orchestrators (e.g., Docker, k8s, Render).
// It must remain lightweight and not import or call any code that triggers database initialization
// or performs heavy work, to ensure it's safe to call frequently for monitoring purposes.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
