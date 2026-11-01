import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import type { Role } from '../generated/prisma/enums.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`: who is calling, for which hospital, with which role. */
      auth?: { userId: string; hospitalId: string; role: Role };
      /** Set by `authenticate`: Prisma client limited to the caller's hospital. */
      db?: ScopedPrisma;
    }
  }
}

export {};
