// Services hold the business logic and data access; they know nothing about HTTP.
export function getHealthStatus() {
  return { status: 'ok' as const, uptime: process.uptime(), timestamp: new Date().toISOString() };
}
