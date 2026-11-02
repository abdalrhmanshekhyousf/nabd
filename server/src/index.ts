import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { attachRealtime, closeRealtime } from './realtime/realtime.js';

// Fail fast if the database is unreachable instead of erroring on the first request.
// ($connect is lazy with the pg adapter, so run a real query.)
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (err) {
  console.error('Cannot reach the database. Check DATABASE_URL in server/.env');
  console.error(err);
  process.exit(1);
}

const server = createApp().listen(env.port, () => {
  console.info(`Nabd server listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
// Live notifications share the API's port (task 2.1).
attachRealtime(server);

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  // Closing Socket.io also closes the HTTP server it is attached to.
  void closeRealtime().then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
