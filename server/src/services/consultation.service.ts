import type { ConsultationReplyData, ConsultationView, CreateConsultationData } from '@nabd/shared';
import type { Consultation } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { loadFile } from './medicalRecord.service.js';
import { sendNotification } from './notification.service.js';

/** What a consultation row needs to be shown: the patient it is about. */
export const consultationInclude = {
  record: {
    select: {
      patient: {
        select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
      },
    },
  },
} as const;

type Row = Consultation & {
  record: {
    patient: {
      id: string;
      fullName: string | null;
      isAnonymous: boolean;
      gender: 'MALE' | 'FEMALE' | null;
      dateOfBirth: Date | null;
    };
  };
};

export function toConsultationView(row: Row): ConsultationView {
  const { patient } = row.record;
  return {
    id: row.id,
    status: row.status,
    question: row.question,
    reply: row.reply,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    consultantId: row.consultantId,
    consultantName: row.consultantName,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
    patient: {
      patientId: patient.id,
      fullName: patient.fullName,
      isAnonymous: patient.isAnonymous,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    },
  };
}

/**
 * The treating doctor asks a colleague about their patient (task 3.12): the
 * question is stored with both names, and the colleague is notified. One open
 * question per colleague and patient.
 */
export async function requestConsultation(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  patientId: string,
  { consultantId, question }: CreateConsultationData,
) {
  const [record, me, consultant] = await Promise.all([
    db.medicalRecord.findFirst({
      where: { patientId, doctorId },
      select: { id: true, patient: { select: { fullName: true } } },
    }),
    db.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }),
    db.user.findFirst({
      where: { id: consultantId, role: 'DOCTOR', isActive: true },
      select: { fullName: true },
    }),
  ]);
  if (!record || !me) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  if (!consultant || consultantId === doctorId) {
    throw new HttpError(400, 'INVALID_CONSULTANT', 'Choose another doctor of this hospital');
  }
  const open = await db.consultation.findFirst({
    where: { recordId: record.id, consultantId, status: 'PENDING' },
    select: { id: true },
  });
  if (open) {
    throw new HttpError(
      409,
      'ALREADY_PENDING',
      'This doctor already has a question about this patient',
    );
  }
  const consultation = await db.consultation.create({
    data: {
      hospitalId,
      recordId: record.id,
      requesterId: doctorId,
      requesterName: me.fullName,
      consultantId,
      consultantName: consultant.fullName,
      question,
    },
    include: consultationInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { userIds: [consultantId] },
    type: 'CONSULTATION_REQUEST',
    data: { patient: record.patient.fullName, from: me.fullName },
    link: `/doctor/consultations?open=${consultation.id}`,
  });
  emitRefresh(rooms.user(consultantId), [['consultations']]);
  return toConsultationView(consultation);
}

/** The asking doctor withdraws a question not yet answered. */
export async function cancelConsultation(db: ScopedPrisma, doctorId: string, id: string) {
  const found = await db.consultation.findFirst({
    where: { id, requesterId: doctorId },
    select: { consultantId: true },
  });
  if (!found) throw new HttpError(404, 'NOT_FOUND', 'Consultation not found');
  const { count } = await db.consultation.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'This consultation is no longer open');
  }
  if (found.consultantId) emitRefresh(rooms.user(found.consultantId), [['consultations']]);
  return toConsultationView(
    await db.consultation.findUniqueOrThrow({ where: { id }, include: consultationInclude }),
  );
}

/**
 * Whether this doctor may read this file as a consultant (task 3.13): only
 * while a question to them about it is open.
 */
export async function consultingOn(db: ScopedPrisma, doctorId: string, recordId: string) {
  const open = await db.consultation.findFirst({
    where: { recordId, consultantId: doctorId, status: 'PENDING' },
    select: { id: true },
  });
  return open !== null;
}

/**
 * The consulted doctor reads the patient's file (task 3.13), read-only and only
 * while the question is open: once answered or withdrawn the access ends.
 */
export async function consultationFile(db: ScopedPrisma, doctorId: string, id: string) {
  const consultation = await db.consultation.findFirst({
    where: { id, consultantId: doctorId },
    include: consultationInclude,
  });
  if (!consultation) throw new HttpError(404, 'NOT_FOUND', 'Consultation not found');
  if (consultation.status !== 'PENDING') {
    throw new HttpError(403, 'CONSULTATION_CLOSED', 'This consultation is closed');
  }
  const file = await loadFile(db, { id: consultation.recordId });
  // The consultant reads the file, not the other consultations about it.
  return { consultation: toConsultationView(consultation), file: { ...file, consultations: [] } };
}

/**
 * The consultant answers (task 3.14): the reply closes the question (and with
 * it the access to the file), goes into the file as a report signed by the
 * consultant, and the asking doctor is told. Answering twice, or after it was
 * withdrawn, is refused.
 */
export async function replyToConsultation(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
  { reply, diagnosis }: ConsultationReplyData,
) {
  const found = await db.consultation.findFirst({
    where: { id, consultantId: doctorId },
    include: consultationInclude,
  });
  if (!found) throw new HttpError(404, 'NOT_FOUND', 'Consultation not found');
  const answeredAt = new Date();
  const answered = await db.$transaction(async (tx) => {
    const { count } = await tx.consultation.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ANSWERED', reply, answeredAt },
    });
    if (count === 0) {
      throw new HttpError(409, 'CONSULTATION_CLOSED', 'This consultation is closed');
    }
    await tx.doctorReport.create({
      data: {
        hospitalId,
        recordId: found.recordId,
        doctorId,
        doctorName: found.consultantName,
        title: found.question.slice(0, 200),
        diagnosis,
        content: reply,
        consultationId: id,
      },
    });
    await tx.medicalRecord.update({
      where: { id: found.recordId },
      data: { updatedAt: answeredAt },
    });
    return tx.consultation.findUniqueOrThrow({ where: { id }, include: consultationInclude });
  });
  if (found.requesterId) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [found.requesterId] },
      type: 'CONSULTATION_REPLY',
      data: { patient: found.record.patient.fullName, from: found.consultantName },
      link: `/doctor/patients/${found.record.patient.id}`,
    });
    emitRefresh(rooms.user(found.requesterId), [
      ['patient-file'],
      ['my-patients'],
      ['consultations'],
    ]);
  }
  emitRefresh(rooms.user(doctorId), [['consultations']]);
  return toConsultationView(answered);
}

/** The questions I was asked (withdrawn ones hidden) and the ones I asked, latest first. */
export async function listConsultations(db: ScopedPrisma, doctorId: string) {
  const [received, sent] = await Promise.all([
    db.consultation.findMany({
      where: { consultantId: doctorId, status: { not: 'CANCELLED' } },
      include: consultationInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.consultation.findMany({
      where: { requesterId: doctorId },
      include: consultationInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return { received: received.map(toConsultationView), sent: sent.map(toConsultationView) };
}
