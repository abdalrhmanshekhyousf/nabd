import type { RegisterHospitalInput } from '@nabd/shared';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  type AccessTokenPayload,
} from '../lib/tokens.js';
import { HttpError } from '../middleware/errorHandler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Compared against when the email is unknown, so a wrong email takes as long as
// a wrong password and response times don't reveal which emails exist.
const dummyHash = hashPassword('nabd-timing-equalizer');

const userSelect = {
  id: true,
  hospitalId: true,
  role: true,
  email: true,
  fullName: true,
  language: true,
  theme: true,
  isActive: true,
  passwordHash: true,
  hospital: { select: { id: true, name: true, logoUrl: true } },
} as const;

type LoginInput = { email: string; password: string; hospitalId?: string };
type SessionContext = { userAgent?: string };

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: AccessTokenPayload['role'];
    language: 'AR' | 'EN';
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    hospital: { id: string; name: string; logoUrl: string | null };
  };
};

async function startSession(
  user: { id: string; hospitalId: string; role: AccessTokenPayload['role'] },
  { userAgent }: SessionContext,
) {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env.refreshTokenTtlDays * DAY_MS);
  await prisma.refreshToken.create({
    data: {
      hospitalId: user.hospitalId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: userAgent?.slice(0, 255),
      expiresAt: refreshTokenExpiresAt,
    },
  });
  const accessToken = signAccessToken({
    sub: user.id,
    hospitalId: user.hospitalId,
    role: user.role,
  });
  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

function publicUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: AccessTokenPayload['role'];
  language: 'AR' | 'EN';
  theme: 'LIGHT' | 'DARK' | 'SYSTEM';
  hospital: { id: string; name: string; logoUrl: string | null };
}): AuthSession['user'] {
  const { id, email, fullName, role, language, theme, hospital } = user;
  return { id, email, fullName, role, language, theme, hospital };
}

/**
 * Email + password login. The same email can exist in several hospitals (a
 * patient has one account per hospital): if the password matches more than one
 * and no hospital was chosen, the client gets HOSPITAL_REQUIRED with only those
 * hospitals to pick from. Nothing about an account is revealed without its password.
 */
export async function login(
  { email, password, hospitalId }: LoginInput,
  context: SessionContext,
): Promise<AuthSession> {
  const candidates = await prisma.user.findMany({
    where: { email: email.trim().toLowerCase(), ...(hospitalId ? { hospitalId } : {}) },
    select: userSelect,
  });

  if (candidates.length === 0) {
    await verifyPassword(password, await dummyHash);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const matches = [];
  for (const candidate of candidates) {
    if (await verifyPassword(password, candidate.passwordHash)) matches.push(candidate);
  }
  if (matches.length === 0) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (matches.length > 1) {
    throw new HttpError(409, 'HOSPITAL_REQUIRED', 'Choose the hospital to sign in to', {
      hospitals: matches.map(({ hospital }) => ({ id: hospital.id, name: hospital.name })),
    });
  }

  const user = matches[0];
  if (!user.isActive) {
    throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const session = await startSession(user, context);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ...session, user: publicUser(user) };
}

/**
 * Exchanges a refresh token for a new access + refresh token pair (rotation).
 * A token that was already used is a sign it was stolen, so every session of
 * that user is ended.
 */
export async function refresh(
  refreshToken: string | undefined,
  context: SessionContext,
): Promise<AuthSession> {
  const invalid = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Please sign in again');
  if (!refreshToken) throw invalid();

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { select: userSelect } },
  });
  if (!stored) throw invalid();

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw invalid();
  }
  if (stored.expiresAt <= new Date() || !stored.user.isActive) throw invalid();

  // Conditional revoke: if two refreshes race with the same token, only one wins.
  const revoked = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) throw invalid();

  const session = await startSession(stored.user, context);
  return { ...session, user: publicUser(stored.user) };
}

/** Ends the session of this refresh token. Unknown or missing tokens are ignored. */
export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Self-service sign-up of a new hospital (task 1.22): the hospital, its first
 * admin and the admin's staff profile are created together, then the admin is
 * signed straight in.
 */
export async function registerHospital(
  { hospital, admin }: RegisterHospitalInput,
  context: SessionContext,
): Promise<AuthSession> {
  const passwordHash = await hashPassword(admin.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.hospital.create({ data: hospital });
    return tx.user.create({
      data: {
        hospitalId: created.id,
        role: 'ADMIN',
        email: admin.email,
        fullName: admin.fullName,
        passwordHash,
        lastLoginAt: new Date(),
        staffProfile: { create: { hospitalId: created.id } },
      },
      select: userSelect,
    });
  });

  const session = await startSession(user, context);
  return { ...session, user: publicUser(user) };
}
