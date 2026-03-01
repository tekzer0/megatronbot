// This endpoint is for health checks (e.g., by orchestrators like Docker, k8s, Render).
// It must remain lightweight and DB-free for monitoring purposes.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
