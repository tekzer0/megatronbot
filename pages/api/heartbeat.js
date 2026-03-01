// This API route is a lightweight heartbeat endpoint designed for health checks.
// It must remain free of any database operations or heavy processing to ensure
// it can be called frequently by monitoring tools without affecting performance
// or opening the DB file unnecessarily.
export default function handler(request, response) {
  response.status(200).json({ status: 'ok' });
}
