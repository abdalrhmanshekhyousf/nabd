import type {
  IdentifyPatientData,
  PatientAccountData,
  QuickRegistrationData,
  ReceptionPatient,
  ReceptionPatientData,
} from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { registerArrival } from './er.service.js';

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
export async function searchPatients(db: ScopedPrisma, search: string, anonymous = false) {
  const rows = await db.patient.findMany({
    where: anonymous
      ? { isAnonymous: true }
      : search
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

/**
 * Reception registers an emergency arrival (task 4.3), as an ER nurse does
 * (2.11): known or unidentified, straight onto the ER waiting list for triage.
 */
export async function registerErArrival(
  db: ScopedPrisma,
  hospitalId: string,
  input: QuickRegistrationData,
) {
  const er = await db.department.findFirst({
    where: { code: 'EMERGENCY' },
    select: { id: true },
  });
  if (!er) throw new HttpError(409, 'INVALID_TRANSITION', 'This hospital has no emergency room');
  const visit = await registerArrival(db, hospitalId, null, input);
  return { visit, departmentId: er.id };
}

/** Two notes joined, without repeating one that is already there. */
const joinNotes = (a: string | null, b: string | null) =>
  !a ? b : !b || a.includes(b) ? a : `${a}\n${b}`;

/**
 * An unidentified ER patient gets their name (task 4.3). When the national
 * number is already registered (they were here before, maybe with an account)
 * the unidentified file joins theirs: visits, stays, bookings and everything
 * in the medical file move over, and the unidentified record goes. Then the
 * account can be opened (4.1) if they have none.
 */
export async function identifyPatient(
  db: ScopedPrisma,
  patientId: string,
  { dateOfBirth, ...details }: IdentifyPatientData,
) {
  return db.$transaction(async (tx) => {
    const unknown = await tx.patient.findUnique({
      where: { id: patientId },
      select: { id: true, isAnonymous: true, medicalRecord: true },
    });
    if (!unknown) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
    if (!unknown.isAnonymous) {
      throw new HttpError(409, 'INVALID_TRANSITION', 'This patient is already identified');
    }
    const known = details.nationalId
      ? await tx.patient.findFirst({
          where: { nationalId: details.nationalId, NOT: { id: patientId } },
          select: { id: true, medicalRecord: true },
        })
      : null;

    if (!known) {
      const row = await tx.patient.update({
        where: { id: patientId },
        data: {
          ...details,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          isAnonymous: false,
        },
        select,
      });
      return { patient: toView(row), merged: false };
    }

    const moved = { patientId: known.id };
    await tx.triageAssessment.updateMany({ where: { patientId }, data: moved });
    await tx.bedAssignment.updateMany({ where: { patientId }, data: moved });
    await tx.operationBooking.updateMany({ where: { patientId }, data: moved });
    await tx.appointment.updateMany({ where: { patientId }, data: moved });
    await tx.medicationReminder.updateMany({ where: { patientId }, data: moved });
    const from = unknown.medicalRecord;
    if (from) {
      const record =
        known.medicalRecord ??
        (await tx.medicalRecord.create({
          data: { hospitalId: from.hospitalId, patientId: known.id },
        }));
      const toRecord = { recordId: record.id };
      await tx.doctorReport.updateMany({ where: { recordId: from.id }, data: toRecord });
      await tx.prescription.updateMany({ where: { recordId: from.id }, data: toRecord });
      await tx.labTest.updateMany({ where: { recordId: from.id }, data: toRecord });
      await tx.radiologyImage.updateMany({ where: { recordId: from.id }, data: toRecord });
      await tx.consultation.updateMany({ where: { recordId: from.id }, data: toRecord });
      await tx.medicalRecord.update({
        where: { id: record.id },
        data: {
          allergies: joinNotes(record.allergies, from.allergies),
          chronicConditions: joinNotes(record.chronicConditions, from.chronicConditions),
          notes: joinNotes(record.notes, from.notes),
          doctorId: record.doctorId ?? from.doctorId,
        },
      });
    }
    await tx.patient.delete({ where: { id: patientId } });
    // What reception typed fills in what the known file was missing.
    const current = await tx.patient.findUniqueOrThrow({ where: { id: known.id } });
    const row = await tx.patient.update({
      where: { id: known.id },
      data: {
        phone: current.phone ?? details.phone,
        gender: current.gender ?? details.gender,
        dateOfBirth: current.dateOfBirth ?? (dateOfBirth ? new Date(dateOfBirth) : null),
      },
      select,
    });
    return { patient: toView(row), merged: true };
  });
}
