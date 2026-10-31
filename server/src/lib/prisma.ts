import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env');
}

// One shared client for the whole server.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
});
