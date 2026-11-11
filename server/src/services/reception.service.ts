import type { PatientAccountData, ReceptionPatient, ReceptionPatientData } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const select = {
  id: true,
  fullName: true,
  isAnonymous: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  nationalId: true,
  createdAt: true,
  user: { select: { email: true } },
} as const;

type Row = Prisma.PatientGetPayload<{ select: typeof select }>;

const toView = (row: Row): ReceptionPatient => ({
  patientId: row.id,
  fullName: row.fullName,
  isAnonymous: row.isAnonymous,
  gender: row.gender,
  dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  phone: row.phone,
  nationalId: row.nationalId,
  accountEmail: row.user?.email ?? null,
  createdAt: row.createdAt.toISOString(),
});

function uniqueField(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const target = JSON.stringify(error.meta ?? {});
  return target.includes('email')
    ? 'email'
    : target.includes('nationalId')
      ? 'nationalId'
      : 'other';
}

/** Patients by name, phone or national number, newest first (task 4.1). */
export async function searchPatients(db: ScopedPrisma, search: string) {
  const rows = await db.patient.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { nationalId: { startsWith: search } },
          ],
        }
      : {},
    select,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map(toView);
}

async function emailFree(db: ScopedPrisma, email: string) {
  if (await db.user.count({ where: { email } })) {
    throw new HttpError(409, 'EMAIL_TAKEN', email);
  }
}

/**
 * Reception registers a patient who walked in (task 4.1): their file opens with
 * what reception knows (allergies and chronic conditions included), and their
 * account too when they want one. A national number already registered is
 * refused with that patient, so reception opens them instead of a duplicate.
 */
export async function registerAtReception(
  db: ScopedPrisma,
  hospitalId: string,
  { account, allergies, chronicConditions, dateOfBirth, ...patient }: ReceptionPatientData,
) {
  if (patient.nationalId) {
    const existing = await db.patient.findFirst({
      where: { nationalId: patient.nationalId },
      select: { id: true, fullName: true },
    });
    if (existing) {
      throw new HttpError(409, 'PATIENT_EXISTS', 'A patient with this national number exists', {
        patientId: existing.id,
        fullName: existing.fullName,
      });
    }
  }
  const email = account?.email.toLowerCase();
  if (email) await emailFree(db, email);
  const passwordHash = account ? await hashPassword(account.password) : null;
  try {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          hospitalId,
          ...patient,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          medicalRecord: { create: { hospitalId, allergies, chronicConditions } },
        },
        select: { id: true },
      });
      if (email && passwordHash) {
        await tx.user.create({
          data: {
            hospitalId,
            role: 'PATIENT',
            email,
            fullName: patient.fullName,
            phone: patient.phone,
            passwordHash,
            patient: { connect: { id: created.id } },
          },
        });
      }
      return tx.patient.findUniqueOrThrow({ where: { id: created.id }, select });
    });
    return toView(row);
  } catch (error) {
    const field = uniqueField(error);
    // Someone took the email or the number at the same moment.
    if (field === 'email') throw new HttpError(409, 'EMAIL_TAKEN', email ?? '');
    if (field === 'nationalId') {
      throw new HttpError(409, 'PATIENT_EXISTS', 'A patient with this national number exists');
    }
    throw error;
  }
}

/** Opens an account for a registered patient who has none yet. */
export async function openAccount(
  db: ScopedPrisma,
  hospitalId: string,
  patientId: string,
  account: PatientAccountData,
) {
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { fullName: true, phone: true, userId: true, isAnonymous: true },
  });
  if (!patient) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  if (patient.userId) {
    throw new HttpError(409, 'HAS_ACCOUNT', 'This patient already has an account');
  }
  if (patient.isAnonymous || !patient.fullName) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'Name the patient before opening an account');
  }
  const email = account.email.toLowerCase();
  await emailFree(db, email);
  await db.user.create({
    data: {
      hospitalId,
      role: 'PATIENT',
      email,
      fullName: patient.fullName,
      phone: patient.phone,
      passwordHash: await hashPassword(account.password),
      patient: { connect: { id: patientId } },
    },
  });
  return toView(await db.patient.findUniqueOrThrow({ where: { id: patientId }, select }));
}
