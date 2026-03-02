// This is a lightweight heartbeat endpoint for monitoring purposes (e.g., Docker-desktop, k8s, Render).
// It must remain DB-free and avoid any heavy operations or imports to ensure quick responses.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
