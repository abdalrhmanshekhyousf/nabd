import { existsSync } from 'node:fs';

// Load server/.env when present; real environment variables always win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
} as const;
