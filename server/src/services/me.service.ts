import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const meSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  language: true,
  theme: true,
  hospital: { select: { id: true, name: true, logoUrl: true } },
} as const;

export async function getMe(db: ScopedPrisma, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: meSelect });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  return user;
}

export type Preferences = { language?: 'AR' | 'EN'; theme?: 'LIGHT' | 'DARK' | 'SYSTEM' };

/** Saves the user's language and display mode to their account (tasks 1.10, 1.11). */
export function updatePreferences(db: ScopedPrisma, userId: string, preferences: Preferences) {
  return db.user.update({ where: { id: userId }, data: preferences, select: meSelect });
}
