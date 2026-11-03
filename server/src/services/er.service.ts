import type { QuickRegistrationData } from '@nabd/shared';
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
