// This endpoint is for health checks and must remain lightweight and DB-free.
// It should not import or call any code that triggers DB initialization.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
