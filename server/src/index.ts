import { createApp } from './app.js';
import { env } from './config/env.js';

const server = createApp().listen(env.port, () => {
  console.info(`Nabd server listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
