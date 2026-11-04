import {
  availableAlternatives,
  overrideReasonMissing,
  suggestEsiLevel,
  type DischargeData,
  type DoctorOption,
  type ErVisit,
  type OverrideLevelData,
  type QuickRegistrationData,
  type TransferData,
  type TriageData,
} from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sendNotification } from './notification.service.js';

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
  department: { select: { id: true, name: true, code: true } },
  // The latest call to a doctor (task 2.16).
  calls: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { doctor: { select: { fullName: true } } },
  },
} as const satisfies Prisma.TriageAssessmentInclude;

type VisitRow = Prisma.TriageAssessmentGetPayload<{ include: typeof visitInclude }>;

/** The shape the ER screens use; the temperature leaves the database as a Decimal. */
export function toErVisit(visit: VisitRow): ErVisit {
  const temperature = visit.temperature === null ? null : Number(visit.temperature);
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
    temperature,
    painScore: visit.painScore,
    expectedExams: visit.expectedExams,
    suggestedLevel: visit.suggestedLevel,
    level: visit.level,
    overrideReason: visit.overrideReason,
    reasons: visit.assessedAt ? suggestEsiLevel({ ...visit, temperature }).reasons : [],
    call: visit.calls[0] ? toCallView(visit.calls[0]) : null,
    closedAt: visit.closedAt?.toISOString() ?? null,
    closingNote: visit.closingNote,
    department: visit.department,
  };
}

type CallRow = VisitRow['calls'][number];

function toCallView(call: CallRow) {
  return {
    id: call.id,
    status: call.status,
    doctorId: call.doctorId,
    doctorName: call.doctor?.fullName ?? null,
    declineReason: call.declineReason,
    createdAt: call.createdAt.toISOString(),
    respondedAt: call.respondedAt?.toISOString() ?? null,
  };
}

export async function getVisit(db: ScopedPrisma, id: string) {
  const visit = await db.triageAssessment.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  return toErVisit(visit);
}

/**
 * Saves the triage form (task 2.12) for a visit that is still open; the nurse
 * who assessed it is recorded, and the ESI level is suggested from it (2.13).
 */
export async function saveTriage(db: ScopedPrisma, nurseId: string, id: string, input: TriageData) {
  const visit = await db.triageAssessment.findUnique({
    where: { id },
    select: { status: true, level: true, overrideReason: true },
  });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  if (visit.status === 'TRANSFERRED' || visit.status === 'DISCHARGED') {
    throw new HttpError(409, 'VISIT_CLOSED', 'This visit is closed');
  }
  const { level: suggestedLevel } = suggestEsiLevel(input);
  const saved = await db.triageAssessment.update({
    where: { id },
    data: {
      ...input,
      nurseId,
      assessedAt: new Date(),
      suggestedLevel,
      // The suggestion becomes the level, unless the nurse set another with a reason (2.14).
      level: visit.overrideReason ? visit.level : suggestedLevel,
    },
    include: visitInclude,
  });
  return toErVisit(saved);
}

/**
 * The nurse sets the level (task 2.14): another level than the suggested one
 * needs a reason; the suggested one clears the override.
 */
export async function overrideLevel(
  db: ScopedPrisma,
  nurseId: string,
  id: string,
  { level, reason }: OverrideLevelData,
) {
  const visit = await db.triageAssessment.findUnique({
    where: { id },
    select: { status: true, suggestedLevel: true },
  });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  if (visit.status === 'TRANSFERRED' || visit.status === 'DISCHARGED') {
    throw new HttpError(409, 'VISIT_CLOSED', 'This visit is closed');
  }
  if (visit.suggestedLevel === null) {
    throw new HttpError(409, 'NOT_ASSESSED', 'Triage the patient first');
  }
  if (overrideReasonMissing(level, visit.suggestedLevel, reason)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A reason is required', {
      issues: [{ path: ['reason'], message: 'validation.required' }],
    });
  }
  const overridden = level !== visit.suggestedLevel;
  const saved = await db.triageAssessment.update({
    where: { id },
    data: { level, overrideReason: overridden ? reason : null, nurseId },
    include: visitInclude,
  });
  return toErVisit(saved);
}

/**
 * The emergency waiting list (task 2.15): open visits only. New arrivals not
 * triaged yet come first (they must be seen), then by level, then by who came
 * first.
 */
export async function getQueue(db: ScopedPrisma) {
  const visits = await db.triageAssessment.findMany({
    where: { status: { in: ['WAITING', 'IN_TREATMENT'] } },
    include: visitInclude,
    orderBy: [{ level: { sort: 'asc', nulls: 'first' } }, { arrivedAt: 'asc' }],
  });
  return visits.map(toErVisit);
}

/** Every active doctor with their status and department, for the ER picker (task 2.16). */
export async function listDoctors(db: ScopedPrisma): Promise<DoctorOption[]> {
  const doctors = await db.user.findMany({
    where: { role: 'DOCTOR', isActive: true, doctorProfile: { isNot: null } },
    select: {
      id: true,
      fullName: true,
      doctorProfile: { select: { specialty: true, status: true } },
      staffProfile: { select: { department: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { fullName: 'asc' },
  });
  return doctors.map((doctor) => ({
    id: doctor.id,
    fullName: doctor.fullName,
    specialty: doctor.doctorProfile!.specialty,
    status: doctor.doctorProfile!.status,
    department: doctor.staffProfile?.department ?? null,
  }));
}

async function requireOpenVisit(db: ScopedPrisma, id: string) {
  const visit = await db.triageAssessment.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Visit not found');
  if (visit.status === 'TRANSFERRED' || visit.status === 'DISCHARGED') {
    throw new HttpError(409, 'VISIT_CLOSED', 'This visit is closed');
  }
  return visit;
}

/**
 * Calls a specific doctor to an ER patient (task 2.16). Only an available
 * doctor is called; a busy one or one on leave is refused with the available
 * doctors of the same specialty to choose from. The doctor is alerted with an
 * urgent notification and answers in 2.9.
 */
export async function callDoctor(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  visitId: string,
  doctorId: string,
) {
  const visit = await requireOpenVisit(db, visitId);
  if (visit.calls[0]?.status === 'PENDING') {
    throw new HttpError(409, 'CALL_PENDING', 'A call is waiting for an answer');
  }
  const doctors = await listDoctors(db);
  const doctor = doctors.find((candidate) => candidate.id === doctorId);
  if (!doctor) throw new HttpError(404, 'NOT_FOUND', 'Doctor not found');
  if (doctor.status !== 'AVAILABLE') {
    throw new HttpError(409, 'DOCTOR_UNAVAILABLE', 'This doctor is not available', {
      status: doctor.status,
      alternatives: availableAlternatives(doctors, doctor),
    });
  }

  const call = await db.doctorCall.create({
    data: { hospitalId, triageId: visitId, doctorId, calledById: nurseId },
    include: { doctor: { select: { fullName: true } } },
  });
  await sendNotification(db, hospitalId, {
    to: { userIds: [doctorId] },
    type: 'DOCTOR_CALL',
    data: {
      patient: visit.patient.isAnonymous ? null : visit.patient.fullName,
      level: visit.level,
      complaint: visit.chiefComplaint,
    },
    link: '/doctor/calls',
  });
  return toCallView(call);
}

/** The nurse withdraws a call nobody has answered yet. */
export async function cancelCall(db: ScopedPrisma, visitId: string, callId: string) {
  const call = await db.doctorCall.findFirst({ where: { id: callId, triageId: visitId } });
  if (!call) throw new HttpError(404, 'NOT_FOUND', 'Call not found');
  if (call.status !== 'PENDING') {
    throw new HttpError(409, 'VISIT_CLOSED', 'This call was already answered');
  }
  const cancelled = await db.doctorCall.update({
    where: { id: callId },
    data: { status: 'CANCELLED', respondedAt: new Date() },
    include: { doctor: { select: { fullName: true } } },
  });
  return toCallView(cancelled);
}

/** Waiting or being treated, while the patient is in the ER (task 2.17). */
export async function setErStatus(
  db: ScopedPrisma,
  id: string,
  status: 'WAITING' | 'IN_TREATMENT',
) {
  await requireOpenVisit(db, id);
  const saved = await db.triageAssessment.update({
    where: { id },
    data: { status },
    include: visitInclude,
  });
  return toErVisit(saved);
}

/**
 * Closes the visit: the patient leaves the ER, transferred to a ward or
 * discharged home. A call still waiting for an answer is withdrawn. Returns
 * the visit and the doctors whose calls were withdrawn (to refresh them).
 */
async function closeVisit(
  db: ScopedPrisma,
  id: string,
  data: { status: 'TRANSFERRED' | 'DISCHARGED'; closingNote: string | null; departmentId?: string },
) {
  await requireOpenVisit(db, id);
  return db.$transaction(async (tx) => {
    const withdrawn = await tx.doctorCall.findMany({
      where: { triageId: id, status: 'PENDING' },
      select: { doctorId: true },
    });
    await tx.doctorCall.updateMany({
      where: { triageId: id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    const saved = await tx.triageAssessment.update({
      where: { id },
      data: { ...data, closedAt: new Date() },
      include: visitInclude,
    });
    return {
      visit: toErVisit(saved),
      withdrawnDoctorIds: withdrawn.flatMap((call) => (call.doctorId ? [call.doctorId] : [])),
    };
  });
}

/** Transfers the patient to a ward of this hospital (not back to the ER). */
export async function transferVisit(
  db: ScopedPrisma,
  id: string,
  { departmentId, note }: TransferData,
) {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { code: true },
  });
  if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
  if (department.code === 'EMERGENCY') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a department other than the ER', {
      issues: [{ path: ['departmentId'], message: 'validation.invalid' }],
    });
  }
  return closeVisit(db, id, { status: 'TRANSFERRED', closingNote: note, departmentId });
}

/** Sends the patient home, with their instructions. */
export async function dischargeVisit(db: ScopedPrisma, id: string, { note }: DischargeData) {
  return closeVisit(db, id, { status: 'DISCHARGED', closingNote: note });
}
