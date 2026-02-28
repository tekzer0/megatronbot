export default function handler(req, res) {
  // Return HTTP 200 with minimal JSON payload
  // No database access, no heavy computations
  res.status(200).json({ status: 'ok' });
}
