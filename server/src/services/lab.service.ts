import type {
  LabBoardItem,
  LabOrderData,
  LabResultData,
  LabTestCode,
  LabTestView,
  Role,
} from '@nabd/shared';
import type { LabTest } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { detectReportType, removeFile, storedPath, storedType, storeFile } from '../lib/uploads.js';
import { HttpError } from '../middleware/errorHandler.js';
import { consultingOn } from './consultation.service.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from './notification.service.js';

/** A lab test as the file and the lab board show it (task 3.4). */
export function toLabView(test: LabTest): LabTestView {
  return {
    id: test.id,
    code: test.code as LabTestCode,
    priority: test.priority,
    status: test.status,
    notes: test.notes,
    doctorName: test.doctorName,
    technicianName: test.technicianName,
    result: test.result,
    hasResultFile: test.resultFile !== null,
    abnormal: test.abnormal,
    createdAt: test.createdAt.toISOString(),
    startedAt: test.startedAt?.toISOString() ?? null,
    completedAt: test.completedAt?.toISOString() ?? null,
  };
}

/** The lab's boards (3.5) list the new tests at once. */
function announceToLab(hospitalId: string) {
  emitRefresh(rooms.role(hospitalId, 'LAB_TECHNICIAN'), [['lab-tests']]);
}

/**
 * A doctor orders tests for one of their patients (task 3.4): each test is its
 * own line for the lab, signed with the doctor's name, in the patient's file.
 */
export async function orderLabTests(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  patientId: string,
  { codes, priority, notes }: LabOrderData,
) {
  const [record, doctor] = await Promise.all([
    db.medicalRecord.findFirst({ where: { patientId, doctorId }, select: { id: true } }),
    db.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }),
  ]);
  if (!record || !doctor) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  const tests = await db.labTest.createManyAndReturn({
    data: codes.map((code) => ({
      hospitalId,
      recordId: record.id,
      code,
      priority,
      notes,
      doctorId,
      doctorName: doctor.fullName,
    })),
  });
  announceToLab(hospitalId);
  return tests.map(toLabView);
}

/** The doctor withdraws a test the lab has not started on. */
export async function cancelLabTest(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
) {
  const test = await db.labTest.findFirst({ where: { id, doctorId }, select: { id: true } });
  if (!test) throw new HttpError(404, 'NOT_FOUND', 'Test not found');
  const { count } = await db.labTest.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'The lab has already started on this test');
  }
  announceToLab(hospitalId);
  return toLabView(await db.labTest.findUniqueOrThrow({ where: { id } }));
}

const boardInclude = {
  record: {
    select: {
      patientId: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          isAnonymous: true,
          gender: true,
          dateOfBirth: true,
          userId: true,
        },
      },
    },
  },
} as const;

type BoardRow = LabTest & {
  record: {
    patientId: string;
    patient: {
      id: string;
      fullName: string | null;
      isAnonymous: boolean;
      gender: 'MALE' | 'FEMALE' | null;
      dateOfBirth: Date | null;
      userId: string | null;
    };
  };
};

function toBoardItem(row: BoardRow, viewerId: string): LabBoardItem {
  const { patient } = row.record;
  return {
    ...toLabView(row),
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      isAnonymous: patient.isAnonymous,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    },
    mine: row.technicianId === viewerId,
  };
}

/**
 * The lab board (task 3.5): tests waiting and in progress, urgent first, then
 * oldest first; and the ones finished in the last twelve hours.
 */
export async function labBoard(db: ScopedPrisma, technicianId: string) {
  const rows = await db.labTest.findMany({
    where: {
      OR: [
        { status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
        { status: 'DONE', completedAt: { gt: new Date(Date.now() - 12 * 3_600_000) } },
      ],
    },
    include: boardInclude,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => toBoardItem(row, technicianId));
}

async function technicianName(db: ScopedPrisma, technicianId: string) {
  const user = await db.user.findUnique({
    where: { id: technicianId },
    select: { fullName: true },
  });
  return user?.fullName ?? '';
}

/** A technician takes a waiting test; two at once: the second is told who has it. */
export async function startLabTest(
  db: ScopedPrisma,
  hospitalId: string,
  technicianId: string,
  id: string,
) {
  const name = await technicianName(db, technicianId);
  const { count } = await db.labTest.updateMany({
    where: { id, status: 'REQUESTED' },
    data: {
      status: 'IN_PROGRESS',
      technicianId,
      technicianName: name,
      startedAt: new Date(),
    },
  });
  const test = await db.labTest.findUnique({ where: { id }, include: boardInclude });
  if (!test) throw new HttpError(404, 'NOT_FOUND', 'Test not found');
  if (count === 0) {
    if (test.status === 'IN_PROGRESS') {
      throw new HttpError(409, 'ALREADY_TAKEN', 'Someone else already took this test', {
        by: test.technicianName,
      });
    }
    throw new HttpError(409, 'INVALID_TRANSITION', `The test is ${test.status}`);
  }
  announceToLab(hospitalId);
  emitRefresh(rooms.hospital(hospitalId), [['patient-file', test.record.patientId]]);
  return toBoardItem(test, technicianId);
}

/**
 * The result goes into the patient's file (task 3.5): the values written out
 * and/or the report file (a PDF or a photo of it, checked by its own bytes),
 * whether it is abnormal; the ordering doctor and the patient are told.
 */
export async function recordLabResult(
  db: ScopedPrisma,
  hospitalId: string,
  technicianId: string,
  id: string,
  { result, abnormal }: LabResultData,
  file: Buffer | null,
) {
  const test = await db.labTest.findUnique({ where: { id }, include: boardInclude });
  if (!test) throw new HttpError(404, 'NOT_FOUND', 'Test not found');
  if (test.status === 'IN_PROGRESS' && test.technicianId !== technicianId) {
    throw new HttpError(403, 'FORBIDDEN', 'Another technician is on this test', {
      by: test.technicianName,
    });
  }
  if (test.status !== 'REQUESTED' && test.status !== 'IN_PROGRESS') {
    throw new HttpError(409, 'INVALID_TRANSITION', `The test is ${test.status}`);
  }
  if (!result && !file) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Write the result or attach its file', {
      fields: { result: 'validation.required' },
    });
  }
  let key: string | null = null;
  if (file) {
    const type = detectReportType(file);
    if (!type) {
      throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'A result is a PDF, PNG or JPEG file');
    }
    key = await storeFile(`lab-results/${hospitalId}`, file, type);
  }
  const now = new Date();
  const { count } = await db.labTest.updateMany({
    where: { id, status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
    data: {
      status: 'DONE',
      result,
      abnormal,
      resultFile: key,
      completedAt: now,
      startedAt: test.startedAt ?? now,
      technicianId,
      technicianName: test.technicianName ?? (await technicianName(db, technicianId)),
    },
  });
  if (count === 0) {
    await removeFile(key);
    throw new HttpError(409, 'INVALID_TRANSITION', 'The test changed meanwhile');
  }

  const { patient, patientId } = test.record;
  const data = { code: test.code, patient: patient.isAnonymous ? null : patient.fullName };
  if (test.doctorId) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [test.doctorId] },
      type: 'LAB_RESULT',
      data,
      link: `/doctor/patients/${patientId}`,
    });
  }
  if (patient.userId) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [patient.userId] },
      type: 'LAB_RESULT',
      data,
      link: '/patient/file',
    });
  }
  announceToLab(hospitalId);
  emitRefresh(rooms.hospital(hospitalId), [['patient-file', patientId]]);
  const done = await db.labTest.findUniqueOrThrow({ where: { id }, include: boardInclude });
  return toBoardItem(done, technicianId);
}

/**
 * A result's file, for those allowed to see it (task 3.5): the lab, the
 * patient's doctor (or the one who ordered it), and the patient themselves.
 */
export async function labResultFile(
  db: ScopedPrisma,
  viewer: { userId: string; role: Role },
  id: string,
) {
  const test = await db.labTest.findUnique({
    where: { id },
    select: {
      resultFile: true,
      doctorId: true,
      recordId: true,
      record: { select: { doctorId: true, patient: { select: { userId: true } } } },
    },
  });
  const allowed =
    test &&
    (viewer.role === 'LAB_TECHNICIAN' ||
      (viewer.role === 'DOCTOR' &&
        (test.doctorId === viewer.userId ||
          test.record.doctorId === viewer.userId ||
          (await consultingOn(db, viewer.userId, test.recordId)))) ||
      (viewer.role === 'PATIENT' && test.record.patient.userId === viewer.userId));
  if (!allowed || !test.resultFile) throw new HttpError(404, 'NOT_FOUND', 'File not found');
  const type = storedType(test.resultFile);
  if (!type) throw new HttpError(404, 'NOT_FOUND', 'File not found');
  return { path: storedPath(test.resultFile), type };
}
