import type {
  AdmissionCandidate,
  AdmitData,
  BedStatus,
  DischargeStayData,
  IncomingPatient,
  WardBedStatusData,
  WardBoard,
  WardStay,
} from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { changeBedStatus, requestBedCleaning } from './bedStatus.service.js';
import { announceCleaning } from './cleaning.service.js';
import { sendNotification } from './notification.service.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

const patientSelect = {
  id: true,
  fullName: true,
  isAnonymous: true,
  gender: true,
  dateOfBirth: true,
} as const;

type PatientRow = {
  id: string;
  fullName: string | null;
  isAnonymous: boolean;
  gender: 'MALE' | 'FEMALE' | null;
  dateOfBirth: Date | null;
};

const toPatient = (p: PatientRow) => ({
  patientId: p.id,
  fullName: p.fullName,
  isAnonymous: p.isAnonymous,
  gender: p.gender,
  dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
});

/** The ward a nurse works in (task 3.16): their department, or 403. */
export async function requireWardNurse(db: ScopedPrisma, userId: string) {
  const profile = await db.staffProfile.findUnique({
    where: { userId },
    select: { department: { select: { id: true, name: true, code: true } } },
  });
  if (!profile?.department) {
    throw new HttpError(403, 'FORBIDDEN', 'Only nurses of a department manage its beds');
  }
  return profile.department;
}

/** Tells the department's cleaners a bed waits for them (task 3.17), once committed. */
async function callCleaners(
  db: ScopedPrisma,
  hospitalId: string,
  cleaning: { departmentId: string; room: string; bed: string } | null,
  reason: 'DISCHARGED' | 'MOVED',
) {
  if (!cleaning) return;
  await sendNotification(db, hospitalId, {
    to: { role: 'CLEANER', departmentId: cleaning.departmentId },
    type: 'BED_DISCHARGED',
    data: { room: cleaning.room, bed: cleaning.bed, reason },
    link: '/cleaning/tasks',
  });
  announceCleaning(cleaning.departmentId);
}

/** Locks beds in a fixed order (two moves crossing never wait on each other). */
async function lockBeds(tx: Tx, hospitalId: string, departmentId: string, ids: string[]) {
  const rows: { id: string; status: BedStatus }[] = [];
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx.$queryRaw<{ id: string; status: BedStatus; departmentId: string }[]>`
      SELECT b.id, b.status, r."departmentId" FROM "Bed" b JOIN "Room" r ON r.id = b."roomId"
      WHERE b.id = ${id}::uuid AND b."hospitalId" = ${hospitalId}::uuid FOR UPDATE OF b`;
    // A bed of another department is not this nurse's: "not found".
    if (!row || row.departmentId !== departmentId) {
      throw new HttpError(404, 'NOT_FOUND', 'Bed not found');
    }
    rows.push(row);
  }
  return (id: string) => rows.find((row) => row.id === id)!;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * The ward's board (task 3.16): its rooms and beds with who is in each, and
 * the patients the ER transferred here who wait for a bed.
 */
export async function wardBoard(db: ScopedPrisma, userId: string): Promise<WardBoard> {
  const department = await requireWardNurse(db, userId);
  const [rooms, incoming] = await Promise.all([
    db.room.findMany({
      where: { departmentId: department.id },
      select: {
        id: true,
        number: true,
        floor: true,
        beds: {
          select: {
            id: true,
            label: true,
            status: true,
            statusChangedAt: true,
            assignments: {
              where: { dischargedAt: null },
              select: {
                id: true,
                notes: true,
                admittedAt: true,
                admittedByName: true,
                visitId: true,
                patient: { select: patientSelect },
              },
            },
          },
        },
      },
    }),
    db.triageAssessment.findMany({
      where: {
        departmentId: department.id,
        status: 'TRANSFERRED',
        bedAssignments: { none: {} },
        closedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      select: {
        id: true,
        level: true,
        chiefComplaint: true,
        closingNote: true,
        closedAt: true,
        patient: { select: patientSelect },
      },
      orderBy: [{ level: 'asc' }, { closedAt: 'asc' }],
    }),
  ]);
  const natural = new Intl.Collator('en', { numeric: true });
  return {
    department,
    rooms: rooms
      .sort((a, b) => natural.compare(a.number, b.number))
      .map((room) => ({
        id: room.id,
        number: room.number,
        floor: room.floor,
        beds: room.beds
          .sort((a, b) => natural.compare(a.label, b.label))
          .map((bed) => {
            const stay = bed.assignments[0];
            return {
              id: bed.id,
              label: bed.label,
              status: bed.status,
              statusChangedAt: bed.statusChangedAt.toISOString(),
              stay: stay
                ? ({
                    id: stay.id,
                    patient: toPatient(stay.patient),
                    notes: stay.notes,
                    admittedAt: stay.admittedAt.toISOString(),
                    admittedByName: stay.admittedByName,
                    fromEr: stay.visitId !== null,
                  } satisfies WardStay)
                : null,
            };
          }),
      })),
    incoming: incoming.map((visit): IncomingPatient => ({
      visitId: visit.id,
      patient: toPatient(visit.patient),
      level: visit.level,
      chiefComplaint: visit.chiefComplaint,
      closingNote: visit.closingNote,
      transferredAt: (visit.closedAt ?? new Date()).toISOString(),
    })),
  };
}

/** Patients to admit by name: not in a bed already. */
export async function admissionCandidates(
  db: ScopedPrisma,
  search: string,
): Promise<AdmissionCandidate[]> {
  const patients = await db.patient.findMany({
    where: {
      fullName: { contains: search, mode: 'insensitive' },
      bedAssignments: { none: { dischargedAt: null } },
    },
    select: { ...patientSelect, phone: true },
    orderBy: { fullName: 'asc' },
    take: 10,
  });
  return patients.map((p) => ({ ...toPatient(p), phone: p.phone }));
}

/**
 * Admits a patient to an empty or reserved bed of the nurse's ward: an ER
 * transfer waiting here, or a patient found by name. The bed is locked first,
 * so two nurses cannot take it together; a patient already in a bed is refused.
 */
export async function admitPatient(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  { bedId, visitId, patientId, notes }: AdmitData,
) {
  const ward = await requireWardNurse(db, nurseId);
  const nurse = await db.user.findUnique({ where: { id: nurseId }, select: { fullName: true } });
  try {
    return await db.$transaction(async (tx) => {
      const bed = (await lockBeds(tx, hospitalId, ward.id, [bedId]))(bedId);
      if (bed.status !== 'EMPTY' && bed.status !== 'RESERVED') {
        throw new HttpError(409, 'INVALID_TRANSITION', 'This bed is not free');
      }
      let who = patientId;
      if (visitId) {
        const visit = await tx.triageAssessment.findFirst({
          where: { id: visitId, departmentId: ward.id, status: 'TRANSFERRED' },
          select: { patientId: true },
        });
        if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Transfer not found');
        who = visit.patientId;
      } else {
        const found = await tx.patient.findUnique({
          where: { id: patientId! },
          select: { id: true },
        });
        if (!found) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
      }
      const stay = await tx.bedAssignment.create({
        data: {
          hospitalId,
          bedId,
          patientId: who!,
          visitId,
          notes,
          admittedById: nurseId,
          admittedByName: nurse?.fullName ?? '—',
        },
      });
      await changeBedStatus(tx, {
        hospitalId,
        bedId,
        to: 'OCCUPIED',
        actorId: nurseId,
        assignmentId: stay.id,
      });
      return { stayId: stay.id, departmentId: ward.id };
    });
  } catch (error) {
    // The same patient admitted at the same moment by two nurses.
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'ALREADY_ADMITTED', 'This patient is already in a bed');
    }
    throw error;
  }
}

async function requireOpenStay(tx: Tx, departmentId: string, id: string) {
  const stay = await tx.bedAssignment.findFirst({
    where: { id, dischargedAt: null, bed: { room: { departmentId } } },
    select: { id: true, bedId: true },
  });
  if (!stay) throw new HttpError(404, 'NOT_FOUND', 'Stay not found');
  return stay;
}

/**
 * Moves a patient to another free bed of the ward: the stay goes on in the new
 * bed, the old one goes to cleaning.
 */
export async function moveStay(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  id: string,
  bedId: string,
) {
  const ward = await requireWardNurse(db, nurseId);
  const result = await db.$transaction(async (tx) => {
    const stay = await requireOpenStay(tx, ward.id, id);
    if (stay.bedId === bedId) {
      throw new HttpError(409, 'INVALID_TRANSITION', 'The patient is already in this bed');
    }
    await lockBeds(tx, hospitalId, ward.id, [stay.bedId, bedId]);
    await changeBedStatus(tx, {
      hospitalId,
      bedId,
      to: 'OCCUPIED',
      actorId: nurseId,
      assignmentId: id,
    });
    await changeBedStatus(tx, {
      hospitalId,
      bedId: stay.bedId,
      to: 'CLEANING',
      actorId: nurseId,
      assignmentId: id,
      reason: 'MOVED',
    });
    await tx.bedAssignment.update({ where: { id }, data: { bedId } });
    const cleaning = await requestBedCleaning(tx, {
      hospitalId,
      bedId: stay.bedId,
      requestedById: nurseId,
      reason: 'MOVED',
    });
    return { departmentId: ward.id, freedBedId: stay.bedId, cleaning };
  });
  await callCleaners(db, hospitalId, result.cleaning, 'MOVED');
  return result;
}

/** The patient leaves: the stay ends and the bed goes to cleaning (3.17 calls the cleaners). */
export async function dischargeStay(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  id: string,
  { notes }: DischargeStayData,
) {
  const ward = await requireWardNurse(db, nurseId);
  const nurse = await db.user.findUnique({ where: { id: nurseId }, select: { fullName: true } });
  const result = await db.$transaction(async (tx) => {
    const stay = await requireOpenStay(tx, ward.id, id);
    await lockBeds(tx, hospitalId, ward.id, [stay.bedId]);
    await tx.bedAssignment.update({
      where: { id },
      data: {
        dischargedAt: new Date(),
        dischargedById: nurseId,
        dischargedByName: nurse?.fullName ?? '—',
        ...(notes && { notes }),
      },
    });
    await changeBedStatus(tx, {
      hospitalId,
      bedId: stay.bedId,
      to: 'CLEANING',
      actorId: nurseId,
      assignmentId: id,
      reason: 'DISCHARGED',
    });
    const cleaning = await requestBedCleaning(tx, {
      hospitalId,
      bedId: stay.bedId,
      requestedById: nurseId,
      reason: 'DISCHARGED',
    });
    return { departmentId: ward.id, freedBedId: stay.bedId, cleaning };
  });
  await callCleaners(db, hospitalId, result.cleaning, 'DISCHARGED');
  return result;
}

/** By hand: hold an empty bed for someone coming, or free a reserved or cleaned one. */
export async function setWardBedStatus(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  bedId: string,
  { to, reason }: WardBedStatusData,
) {
  const ward = await requireWardNurse(db, nurseId);
  const withdrawn = await db.$transaction(async (tx) => {
    await lockBeds(tx, hospitalId, ward.id, [bedId]);
    const bed = await changeBedStatus(tx, { hospitalId, bedId, to, actorId: nurseId, reason });
    // Cleaned by hand: a job nobody started yet is withdrawn.
    if (to !== 'EMPTY') return 0;
    const { count } = await tx.cleaningRequest.updateMany({
      where: { bedId: bed.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return count;
  });
  if (withdrawn) announceCleaning(ward.id);
  return { departmentId: ward.id };
}
