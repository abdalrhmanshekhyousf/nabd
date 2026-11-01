import type { HospitalInfoInput } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const hospitalSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  email: true,
  logoUrl: true,
} as const;

/** The caller's own hospital (the scoped client can't see any other). */
export async function getHospital(db: ScopedPrisma) {
  const hospital = await db.hospital.findFirst({ select: hospitalSelect });
  if (!hospital) throw new HttpError(404, 'NOT_FOUND', 'Hospital not found');
  return hospital;
}

export function updateHospital(
  db: ScopedPrisma,
  hospitalId: string,
  info: Omit<HospitalInfoInput, 'email'> & { email: string | null },
) {
  return db.hospital.update({ where: { id: hospitalId }, data: info, select: hospitalSelect });
}
