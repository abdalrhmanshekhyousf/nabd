import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/enums.js';

/** What every access token carries: who, which hospital, which role. */
export type AccessTokenPayload = {
  sub: string;
  hospitalId: string;
  role: Role;
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn: env.accessTokenTtlSeconds,
  });
}

/** Throws if the token is invalid or expired (used by the auth middleware, 1.16). */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') throw new Error('Unexpected token payload');
  const { sub, hospitalId, role } = decoded as jwt.JwtPayload & Partial<AccessTokenPayload>;
  if (!sub || !hospitalId || !role) throw new Error('Incomplete token payload');
  return { sub, hospitalId, role };
}

/** A random opaque refresh token; only its hash is stored. */
export function generateRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
