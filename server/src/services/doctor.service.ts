import type { DoctorStatusInput } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

/** The signed-in doctor's status (task 2.5). */
export async function getMyStatus(db: ScopedPrisma, userId: string) {
  const profile = await db.doctorProfile.findUnique({
    where: { userId },
    select: { status: true },
  });
  if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Doctor profile not found');
  return profile;
}

/** Sets the signed-in doctor's status: available, busy or on leave. */
export async function setMyStatus(db: ScopedPrisma, userId: string, { status }: DoctorStatusInput) {
  await getMyStatus(db, userId);
  return db.doctorProfile.update({ where: { userId }, data: { status }, select: { status: true } });
}
