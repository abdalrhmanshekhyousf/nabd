import type {
  ImagingBoardItem,
  ImagingOrderData,
  ImagingReportData,
  ImagingView,
  RadiologyModality,
  Role,
} from '@nabd/shared';
import type { RadiologyImage } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { detectReportType, removeFile, storedPath, storedType, storeFile } from '../lib/uploads.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from './notification.service.js';

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

/**
 * Routing (task 3.7): only the radiologists of the study's type hear of it;
 * their boards list it at once.
 */
function announceToRadiology(hospitalId: string, modality: RadiologyModality) {
  emitRefresh(rooms.modality(hospitalId, modality), [['imaging']]);
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
  announceToRadiology(hospitalId, study.modality);
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
    select: { id: true, modality: true },
  });
  if (!study) throw new HttpError(404, 'NOT_FOUND', 'Study not found');
  const { count } = await db.radiologyImage.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'Radiology has already started on this study');
  }
  announceToRadiology(hospitalId, study.modality);
  return toImagingView(await db.radiologyImage.findUniqueOrThrow({ where: { id } }));
}

/** The imaging types that have at least one radiologist now (task 3.7). */
export async function staffedModalities(db: ScopedPrisma) {
  const rows = await db.staffProfile.findMany({
    where: {
      radiologyModality: { not: null },
      user: { role: 'RADIOLOGIST', isActive: true },
    },
    select: { radiologyModality: true },
    distinct: ['radiologyModality'],
  });
  return rows.map((row) => row.radiologyModality as RadiologyModality);
}

/** The type this radiologist handles; without one the admin has to set it. */
async function modalityOf(db: ScopedPrisma, radiologistId: string) {
  const profile = await db.staffProfile.findUnique({
    where: { userId: radiologistId },
    select: { radiologyModality: true },
  });
  if (!profile?.radiologyModality) {
    throw new HttpError(403, 'FORBIDDEN', 'No imaging type is set for you yet');
  }
  return profile.radiologyModality;
}

const queueInclude = {
  record: {
    select: {
      patient: {
        select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
      },
    },
  },
} as const;

type QueueRow = Awaited<ReturnType<ScopedPrisma['radiologyImage']['findFirstOrThrow']>> & {
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

function toBoardItem(row: QueueRow, viewerId: string): ImagingBoardItem {
  const { patient } = row.record;
  return {
    ...toImagingView(row),
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      isAnonymous: patient.isAnonymous,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    },
    mine: row.radiologistId === viewerId,
  };
}

/**
 * A radiologist's list (task 3.7): only studies of their own type, waiting and
 * in progress (urgent first, oldest first), and those done in twelve hours.
 */
export async function radiologistQueue(db: ScopedPrisma, radiologistId: string) {
  const modality = await modalityOf(db, radiologistId);
  const rows = await db.radiologyImage.findMany({
    where: {
      modality,
      OR: [
        { status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
        { status: 'DONE', completedAt: { gt: new Date(Date.now() - 12 * 3_600_000) } },
      ],
    },
    include: queueInclude,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return { modality, studies: rows.map((row) => toBoardItem(row, radiologistId)) };
}

/** A radiologist of that type takes a waiting study; two at once: one gets it. */
export async function startImaging(
  db: ScopedPrisma,
  hospitalId: string,
  radiologistId: string,
  id: string,
) {
  const modality = await modalityOf(db, radiologistId);
  const study = await db.radiologyImage.findFirst({
    where: { id, modality },
    select: { id: true },
  });
  if (!study) throw new HttpError(404, 'NOT_FOUND', 'Study not found');
  const me = await db.user.findUnique({ where: { id: radiologistId }, select: { fullName: true } });
  const { count } = await db.radiologyImage.updateMany({
    where: { id, status: 'REQUESTED' },
    data: {
      status: 'IN_PROGRESS',
      radiologistId,
      radiologistName: me?.fullName ?? '',
      startedAt: new Date(),
    },
  });
  const current = await db.radiologyImage.findUniqueOrThrow({
    where: { id },
    include: queueInclude,
  });
  if (count === 0) {
    if (current.status === 'IN_PROGRESS') {
      throw new HttpError(409, 'ALREADY_TAKEN', 'Someone else already took this study', {
        by: current.radiologistName,
      });
    }
    throw new HttpError(409, 'INVALID_TRANSITION', `The study is ${current.status}`);
  }
  announceToRadiology(hospitalId, modality);
  emitRefresh(rooms.hospital(hospitalId), [['patient-file']]);
  return toBoardItem(current, radiologistId);
}

/**
 * The radiologist sends the study (task 3.8): the images (or PDF reports,
 * each checked by its own bytes) and the written report into the patient's
 * file; the ordering doctor and the patient are told.
 */
export async function reportImaging(
  db: ScopedPrisma,
  hospitalId: string,
  radiologistId: string,
  id: string,
  { report, abnormal }: ImagingReportData,
  files: Buffer[],
) {
  const modality = await modalityOf(db, radiologistId);
  const study = await db.radiologyImage.findFirst({
    where: { id, modality },
    include: {
      record: {
        select: {
          patientId: true,
          patient: { select: { fullName: true, isAnonymous: true, userId: true } },
        },
      },
    },
  });
  if (!study) throw new HttpError(404, 'NOT_FOUND', 'Study not found');
  if (study.status === 'IN_PROGRESS' && study.radiologistId !== radiologistId) {
    throw new HttpError(403, 'FORBIDDEN', 'Another radiologist is on this study', {
      by: study.radiologistName,
    });
  }
  if (study.status !== 'REQUESTED' && study.status !== 'IN_PROGRESS') {
    throw new HttpError(409, 'INVALID_TRANSITION', `The study is ${study.status}`);
  }
  if (files.length === 0) {
    throw new HttpError(400, 'FILE_REQUIRED', 'Attach at least one image');
  }
  const types = files.map(detectReportType);
  if (types.some((type) => type === null)) {
    throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Images are PNG, JPEG or PDF files');
  }
  const keys: string[] = [];
  for (const [index, file] of files.entries()) {
    keys.push(await storeFile(`imaging/${hospitalId}`, file, types[index]!));
  }
  const me = await db.user.findUnique({ where: { id: radiologistId }, select: { fullName: true } });
  const now = new Date();
  const { count } = await db.radiologyImage.updateMany({
    where: { id, status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
    data: {
      status: 'DONE',
      report,
      abnormal,
      imageFiles: keys,
      completedAt: now,
      startedAt: study.startedAt ?? now,
      radiologistId,
      radiologistName: study.radiologistName ?? me?.fullName ?? '',
    },
  });
  if (count === 0) {
    await Promise.all(keys.map(removeFile));
    throw new HttpError(409, 'INVALID_TRANSITION', 'The study changed meanwhile');
  }

  const { patient, patientId } = study.record;
  const data = {
    modality: study.modality,
    part: study.bodyPart,
    patient: patient.isAnonymous ? null : patient.fullName,
  };
  if (study.doctorId) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [study.doctorId] },
      type: 'IMAGING_RESULT',
      data,
      link: `/doctor/patients/${patientId}`,
    });
  }
  if (patient.userId) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [patient.userId] },
      type: 'IMAGING_RESULT',
      data,
      link: '/patient/file',
    });
  }
  announceToRadiology(hospitalId, modality);
  emitRefresh(rooms.hospital(hospitalId), [['patient-file', patientId]]);
  const done = await db.radiologyImage.findUniqueOrThrow({ where: { id }, include: queueInclude });
  return toBoardItem(done, radiologistId);
}

/**
 * One image of a study, for those allowed to see it (tasks 3.8, 3.9): the
 * radiologists, the patient's doctor (or the one who ordered it), the patient.
 */
export async function imagingFile(
  db: ScopedPrisma,
  viewer: { userId: string; role: Role },
  id: string,
  index: number,
) {
  const study = await db.radiologyImage.findUnique({
    where: { id },
    select: {
      imageFiles: true,
      doctorId: true,
      record: { select: { doctorId: true, patient: { select: { userId: true } } } },
    },
  });
  const allowed =
    study &&
    (viewer.role === 'RADIOLOGIST' ||
      (viewer.role === 'DOCTOR' &&
        (study.doctorId === viewer.userId || study.record.doctorId === viewer.userId)) ||
      (viewer.role === 'PATIENT' && study.record.patient.userId === viewer.userId));
  const key = allowed ? study.imageFiles[index] : undefined;
  const type = key ? storedType(key) : undefined;
  if (!key || !type) throw new HttpError(404, 'NOT_FOUND', 'Image not found');
  return { path: storedPath(key), type };
}
