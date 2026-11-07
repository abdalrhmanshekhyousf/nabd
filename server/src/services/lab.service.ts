import type { LabOrderData, LabTestCode, LabTestView } from '@nabd/shared';
import type { LabTest } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';

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
