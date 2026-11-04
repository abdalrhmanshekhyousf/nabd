import type { DoctorCallItem } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const callInclude = {
  calledBy: { select: { fullName: true } },
  triage: {
    select: {
      id: true,
      status: true,
      level: true,
      chiefComplaint: true,
      arrivedAt: true,
      patient: {
        select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
      },
    },
  },
} as const satisfies Prisma.DoctorCallInclude;

type CallRow = Prisma.DoctorCallGetPayload<{ include: typeof callInclude }>;

function toItem(call: CallRow): DoctorCallItem {
  const { triage } = call;
  return {
    id: call.id,
    status: call.status,
    createdAt: call.createdAt.toISOString(),
    respondedAt: call.respondedAt?.toISOString() ?? null,
    declineReason: call.declineReason,
    calledBy: call.calledBy?.fullName ?? null,
    visit: {
      id: triage.id,
      status: triage.status,
      level: triage.level,
      chiefComplaint: triage.chiefComplaint,
      arrivedAt: triage.arrivedAt.toISOString(),
      patient: {
        ...triage.patient,
        dateOfBirth: triage.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      },
    },
  };
}

/**
 * The doctor's emergency calls (task 2.9): every call waiting for an answer,
 * oldest first, then the latest ten already answered or withdrawn.
 */
export async function listMyCalls(db: ScopedPrisma, doctorId: string) {
  const [pending, answered] = await Promise.all([
    db.doctorCall.findMany({
      where: { doctorId, status: 'PENDING' },
      include: callInclude,
      orderBy: { createdAt: 'asc' },
    }),
    db.doctorCall.findMany({
      where: { doctorId, status: { not: 'PENDING' } },
      include: callInclude,
      orderBy: { respondedAt: 'desc' },
      take: 10,
    }),
  ]);
  return { pending: pending.map(toItem), answered: answered.map(toItem) };
}

/**
 * Accepts or declines one of my calls. Accepting starts the treatment and
 * makes me the patient's treating doctor when they have none yet, so they
 * appear in "my patients". Returns the call and the emergency department to
 * tell.
 */
export async function answerCall(
  db: ScopedPrisma,
  doctorId: string,
  callId: string,
  answer: { accept: true } | { accept: false; reason: string },
) {
  const call = await db.doctorCall.findFirst({
    where: { id: callId, doctorId },
    include: { triage: { select: { id: true, status: true, patientId: true } } },
  });
  if (!call) throw new HttpError(404, 'NOT_FOUND', 'Call not found');
  if (call.status !== 'PENDING') {
    throw new HttpError(409, 'CALL_ANSWERED', 'This call was already answered');
  }

  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.doctorCall.update({
      where: { id: callId },
      data: answer.accept
        ? { status: 'ACCEPTED', respondedAt: new Date() }
        : { status: 'DECLINED', respondedAt: new Date(), declineReason: answer.reason },
      include: callInclude,
    });
    if (answer.accept) {
      if (call.triage.status === 'WAITING') {
        await tx.triageAssessment.update({
          where: { id: call.triage.id },
          data: { status: 'IN_TREATMENT' },
        });
      }
      await tx.medicalRecord.updateMany({
        where: { patientId: call.triage.patientId, doctorId: null },
        data: { doctorId },
      });
    }
    return saved;
  });

  const er = await db.department.findFirst({ where: { code: 'EMERGENCY' }, select: { id: true } });
  return { call: toItem(updated), visitId: call.triage.id, erDepartmentId: er?.id ?? null };
}
