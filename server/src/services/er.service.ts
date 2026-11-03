import type { ErVisit, QuickRegistrationData, TriageData } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

/** The emergency department this person works in, or null (a nurse's type follows it). */
export async function erDepartmentOf(db: ScopedPrisma, userId: string) {
  const profile = await db.staffProfile.findUnique({
    where: { userId },
    select: { department: { select: { id: true, code: true } } },
  });
  return profile?.department?.code === 'EMERGENCY' ? profile.department.id : null;
}

/** Emergency work is for nurses of the emergency department. */
export async function requireErNurse(db: ScopedPrisma, userId: string) {
  const departmentId = await erDepartmentOf(db, userId);
  if (!departmentId) {
    throw new HttpError(403, 'FORBIDDEN', 'Only emergency nurses register arrivals');
  }
  return departmentId;
}

/**
 * The quick registration of an emergency arrival (task 2.11). A known patient
 * who was here before is found by their national ID; otherwise a patient and
 * their empty file are created. The visit starts waiting for triage.
 */
export async function registerArrival(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  input: QuickRegistrationData,
) {
  return db.$transaction(async (tx) => {
    const returning =
      !input.anonymous && input.nationalId
        ? await tx.patient.findFirst({ where: { nationalId: input.nationalId } })
        : null;
    const patient =
      returning ??
      (await tx.patient.create({
        data: {
          hospitalId,
          isAnonymous: input.anonymous,
          gender: input.gender,
          ...(!input.anonymous && {
            fullName: input.fullName,
            phone: input.phone,
            nationalId: input.nationalId,
            dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          }),
          medicalRecord: { create: { hospitalId } },
        },
      }));
    const visit = await tx.triageAssessment.create({
      data: {
        hospitalId,
        patientId: patient.id,
        nurseId,
        chiefComplaint: input.chiefComplaint,
        arrivalNote: input.arrivalNote,
      },
    });
    return {
      id: visit.id,
      patientId: patient.id,
      patientName: patient.fullName,
      isAnonymous: patient.isAnonymous,
      returning: returning !== null,
      status: visit.status,
      arrivedAt: visit.arrivedAt.toISOString(),
    };
  });
}

const visitInclude = {
  patient: {
    select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
  },
} as const satisfies Prisma.TriageAssessmentInclude;

type VisitRow = Prisma.TriageAssessmentGetPayload<{ include: typeof visitInclude }>;

/** The shape the ER screens use; the temperature leaves the database as a Decimal. */
export function toErVisit(visit: VisitRow): ErVisit {
  return {
    id: visit.id,
    status: visit.status,
    arrivedAt: visit.arrivedAt.toISOString(),
    assessedAt: visit.assessedAt?.toISOString() ?? null,
    chiefComplaint: visit.chiefComplaint,
    arrivalNote: visit.arrivalNote,
    patient: {
      ...visit.patient,
      dateOfBirth: visit.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    },
    breathing: visit.breathing,
    consciousness: visit.consciousness,
    pulse: visit.pulse,
    systolic: visit.systolic,
    diastolic: visit.diastolic,
    respiratoryRate: visit.respiratoryRate,
    oxygenSaturation: visit.oxygenSaturation,
    temperature: visit.temperature === null ? null : Number(visit.temperature),
    painScore: visit.painScore,
    expectedExams: visit.expectedExams,
    suggestedLevel: visit.suggestedLevel,
    level: visit.level,
    overrideReason: visit.overrideReason,
  };
}

export async function getVisit(db: ScopedPrisma, id: string) {
  const visit = await db.triageAssessment.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  return toErVisit(visit);
}

/**
 * Saves the triage form (task 2.12) for a visit that is still open; the nurse
 * who assessed it is recorded. The ESI level is suggested from it in 2.13.
 */
export async function saveTriage(db: ScopedPrisma, nurseId: string, id: string, input: TriageData) {
  const visit = await db.triageAssessment.findUnique({ where: { id }, select: { status: true } });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  if (visit.status === 'TRANSFERRED' || visit.status === 'DISCHARGED') {
    throw new HttpError(409, 'VISIT_CLOSED', 'This visit is closed');
  }
  const saved = await db.triageAssessment.update({
    where: { id },
    data: { ...input, nurseId, assessedAt: new Date() },
    include: visitInclude,
  });
  return toErVisit(saved);
}
