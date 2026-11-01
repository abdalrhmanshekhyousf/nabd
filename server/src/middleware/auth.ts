import type { Request, RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { forHospital } from '../lib/scopedPrisma.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { HttpError } from './errorHandler.js';

/**
 * Requires a valid access token (`Authorization: Bearer <token>`). On success sets
 * `req.auth` and `req.db`, a Prisma client that only reaches the caller's hospital.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    // Expired or tampered: the client refreshes and retries (task 1.17).
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired');
  }

  req.auth = { userId: payload.sub, hospitalId: payload.hospitalId, role: payload.role };
  req.db = forHospital(payload.hospitalId);
  next();
};

/** Allows only the listed roles; use after `authenticate`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    if (!roles.includes(req.auth.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this');
    }
    next();
  };
}

/** The caller and their hospital-scoped database, for handlers behind `authenticate`. */
export function session(req: Request) {
  if (!req.auth || !req.db) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return { auth: req.auth, db: req.db };
}
