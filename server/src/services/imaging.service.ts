import type { ImagingOrderData, ImagingView } from '@nabd/shared';
import type { RadiologyImage } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';

/** An imaging study as the file and the radiology board show it (task 3.6). */
export function toImagingView(study: RadiologyImage): ImagingView {
  return {
    id: study.id,
    modality: study.modality,
    bodyPart: study.bodyPart,
    reason: study.reason,
    priority: study.priority,
    status: study.status,
    doctorName: study.doctorName,
    radiologistName: study.radiologistName,
    report: study.report,
    imageCount: study.imageFiles.length,
    abnormal: study.abnormal,
    createdAt: study.createdAt.toISOString(),
    startedAt: study.startedAt?.toISOString() ?? null,
    completedAt: study.completedAt?.toISOString() ?? null,
  };
}

/** The radiologists' boards (3.7, 3.8) list it at once. */
function announceToRadiology(hospitalId: string) {
  emitRefresh(rooms.role(hospitalId, 'RADIOLOGIST'), [['imaging']]);
}

/**
 * A doctor orders an imaging study for one of their patients (task 3.6): the
 * modality, the part of the body and the clinical question, signed with their
 * name in the patient's file.
 */
export async function orderImaging(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  patientId: string,
  { modality, bodyPart, reason, priority }: ImagingOrderData,
) {
  const [record, doctor] = await Promise.all([
    db.medicalRecord.findFirst({ where: { patientId, doctorId }, select: { id: true } }),
    db.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }),
  ]);
  if (!record || !doctor) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  const study = await db.radiologyImage.create({
    data: {
      hospitalId,
      recordId: record.id,
      modality,
      bodyPart,
      reason,
      priority,
      doctorId,
      doctorName: doctor.fullName,
    },
  });
  announceToRadiology(hospitalId);
  return toImagingView(study);
}

/** The doctor withdraws a study no radiologist has started. */
export async function cancelImaging(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
) {
  const study = await db.radiologyImage.findFirst({
    where: { id, doctorId },
    select: { id: true },
  });
  if (!study) throw new HttpError(404, 'NOT_FOUND', 'Study not found');
  const { count } = await db.radiologyImage.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'Radiology has already started on this study');
  }
  announceToRadiology(hospitalId);
  return toImagingView(await db.radiologyImage.findUniqueOrThrow({ where: { id } }));
}
