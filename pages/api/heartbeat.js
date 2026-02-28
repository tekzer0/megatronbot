/**
 * Heartbeat endpoint for health-checking orchestrators.
 * This endpoint purposefully avoids importing any utilities that
 * may initialize the database or run heavy code so that it
 * can be safely called every few seconds by monitoring tools.
 */

// Disable body parsing to keep the endpoint as light as possible.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  // Return HTTP 200 with minimal JSON payload
  // No database access, no heavy computations
  res.status(200).json({ status: 'ok' });
}
