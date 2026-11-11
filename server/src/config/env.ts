import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load server/.env when present; real environment variables always win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? '';
if (jwtAccessSecret.length < 32) {
  throw new Error(
    'JWT_ACCESS_SECRET must be set to at least 32 random characters (see server/.env.example)',
  );
}

if (nodeEnv === 'production' && jwtAccessSecret.startsWith('change-me')) {
  throw new Error('JWT_ACCESS_SECRET still has the example value; set a real secret');
}

const refreshTokenTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtAccessSecret,
  /** Short-lived on purpose; the client refreshes it silently (task 1.17). */
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60),
  refreshTokenTtlDays,
  /** Uploaded files (logos, images, reports). Never served directly, only via the API. */
  uploadsDir: resolve(process.env.UPLOADS_DIR ?? 'uploads'),
  /** Web push (task 3.26); without the keys reminders stay in-app only. */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
} as const;
