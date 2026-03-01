// This endpoint is for health checks (e.g., by orchestrators like Docker, k8s, Render).
// It must remain lightweight and DB-free for monitoring purposes.
// It should not import or call any code that triggers DB initialization
// or performs any heavy work.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
