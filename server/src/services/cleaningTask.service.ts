import type { CleaningRequestView, CreateCleaningRequestData } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { announceCleaning } from './cleaning.service.js';
import { sendNotification } from './notification.service.js';
import { announceStep, orActorsOf, stepRoom, type StepEffects } from './orTransition.service.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

const requestInclude = {
  department: { select: { id: true, name: true, code: true } },
  operatingRoom: { select: { id: true, name: true } },
  requestedBy: { select: { fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
} as const satisfies Prisma.CleaningRequestInclude;

type RequestRow = Prisma.CleaningRequestGetPayload<{ include: typeof requestInclude }>;

function toView(row: RequestRow, viewerId: string): CleaningRequestView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    department: row.department,
    place: row.place,
    operatingRoom: row.operatingRoom,
    note: row.note,
    requestedBy: row.requestedBy?.fullName ?? null,
    assignedTo: row.assignedTo,
    mine: row.assignedToId === viewerId,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

async function coveredDepartments(db: ScopedPrisma, cleanerId: string) {
  const rows = await db.cleanerAssignment.findMany({
    where: { userId: cleanerId },
    select: { departmentId: true },
  });
  return rows.map((row) => row.departmentId);
}

/**
 * The cleaner's board (task 2.24): open jobs in the departments they cover,
 * sterilizations first, oldest first, and what they finished in the last
 * twelve hours.
 */
export async function cleanerBoard(db: ScopedPrisma, cleanerId: string) {
  const departmentIds = await coveredDepartments(db, cleanerId);
  const rows = await db.cleaningRequest.findMany({
    where: {
      departmentId: { in: departmentIds },
      OR: [
        { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        {
          status: 'DONE',
          assignedToId: cleanerId,
          finishedAt: { gt: new Date(Date.now() - 12 * 3_600_000) },
        },
      ],
    },
    include: requestInclude,
    orderBy: [{ kind: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => toView(row, cleanerId));
}

/** One of my departments' jobs, locked for this transaction (rooms are locked first). */
async function lockedRequest(tx: Tx, id: string, departmentIds: string[]) {
  const request = await tx.cleaningRequest.findFirst({
    where: { id, departmentId: { in: departmentIds } },
    select: { operatingRoomId: true, kind: true },
  });
  if (!request) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
  const sterilizesRoom = request.kind === 'STERILIZATION' && request.operatingRoomId;
  if (sterilizesRoom) {
    await tx.$queryRaw`SELECT id FROM "OperatingRoom" WHERE id = ${request.operatingRoomId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM "CleaningRequest" WHERE id = ${id}::uuid FOR UPDATE`;
  const current = await tx.cleaningRequest.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      departmentId: true,
      operatingRoomId: true,
      assignedToId: true,
      assignedTo: { select: { fullName: true } },
    },
  });
  return { ...current, roomId: sterilizesRoom ? request.operatingRoomId : null };
}

type Move = 'start' | 'finish';

/**
 * "Started" and "finished" on a job (task 2.24). Starting takes a waiting job
 * (two cleaners at once: the second is told someone took it); only the one who
 * started finishes it. A sterilization moves its operating room along:
 * sterilizing, then free (or booked again for the next waiting operation).
 */
export async function moveRequest(
  db: ScopedPrisma,
  hospitalId: string,
  cleanerId: string,
  id: string,
  move: Move,
) {
  const [departmentIds, actors] = await Promise.all([
    coveredDepartments(db, cleanerId),
    orActorsOf(db, cleanerId),
  ]);
  const { effects, roomMoved } = await db.$transaction(async (tx) => {
    const job = await lockedRequest(tx, id, departmentIds);
    if (move === 'start' && job.status === 'IN_PROGRESS') {
      throw new HttpError(409, 'ALREADY_TAKEN', 'Someone else already took this request', {
        by: job.assignedTo?.fullName ?? null,
      });
    }
    if (move === 'finish' && job.status === 'IN_PROGRESS' && job.assignedToId !== cleanerId) {
      throw new HttpError(403, 'FORBIDDEN', 'Only the one who started it finishes it');
    }
    const expected = move === 'start' ? 'PENDING' : 'IN_PROGRESS';
    if (job.status !== expected) {
      throw new HttpError(409, 'INVALID_TRANSITION', `${job.status} -> ${move}`);
    }
    if (job.roomId) {
      const stepped: StepEffects = await stepRoom(tx, {
        hospitalId,
        userId: cleanerId,
        actors,
        roomId: job.roomId,
        to: move === 'start' ? 'STERILIZING' : 'AVAILABLE',
      });
      return { effects: stepped, roomMoved: true };
    }
    await tx.cleaningRequest.update({
      where: { id },
      data:
        move === 'start'
          ? { status: 'IN_PROGRESS', assignedToId: cleanerId, startedAt: new Date() }
          : { status: 'DONE', finishedAt: new Date() },
    });
    return {
      effects: { sterilize: null, cleaningDepartmentId: job.departmentId },
      roomMoved: false,
    };
  });
  await announceStep(db, hospitalId, effects);
  // A sterilization also moved a room, and maybe held it again for a booking.
  if (roomMoved) emitRefresh(rooms.hospital(hospitalId), [['operating-rooms'], ['bookings']]);
  const row = await db.cleaningRequest.findUniqueOrThrow({
    where: { id },
    include: requestInclude,
  });
  return toView(row, cleanerId);
}

/** The department this nurse works in, which their cleaning requests go to. */
async function nurseDepartment(db: ScopedPrisma, nurseId: string) {
  const profile = await db.staffProfile.findUnique({
    where: { userId: nurseId },
    select: { departmentId: true },
  });
  if (!profile?.departmentId) {
    throw new HttpError(403, 'FORBIDDEN', 'You are not in a department yet');
  }
  return profile.departmentId;
}

/**
 * A nurse asks for a place in their department to be cleaned (task 2.25). Its
 * cleaners are told, and their boards list it at once.
 */
export async function requestCleaning(
  db: ScopedPrisma,
  hospitalId: string,
  nurseId: string,
  { place, note }: CreateCleaningRequestData,
) {
  const departmentId = await nurseDepartment(db, nurseId);
  const row = await db.cleaningRequest.create({
    data: { hospitalId, departmentId, place, note, requestedById: nurseId },
    include: requestInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'CLEANER', departmentId },
    type: 'CLEANING_REQUEST',
    data: { place },
    link: '/cleaning/tasks',
  });
  announceCleaning(departmentId);
  return toView(row, nurseId);
}

/** My department's cleaning jobs of the last day, so nurses see how theirs are going. */
export async function departmentRequests(db: ScopedPrisma, nurseId: string) {
  const departmentId = await nurseDepartment(db, nurseId);
  const rows = await db.cleaningRequest.findMany({
    where: {
      departmentId,
      kind: 'CLEANING',
      OR: [
        { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        { createdAt: { gt: new Date(Date.now() - 24 * 3_600_000) } },
      ],
    },
    include: requestInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({ ...toView(row, nurseId), mine: row.requestedById === nurseId }));
}

/** The nurse withdraws their own request before anyone has started on it. */
export async function cancelCleaning(db: ScopedPrisma, nurseId: string, id: string) {
  const job = await db.cleaningRequest.findFirst({
    where: { id, requestedById: nurseId, kind: 'CLEANING' },
    select: { status: true, departmentId: true },
  });
  if (!job) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
  const { count } = await db.cleaningRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new HttpError(409, 'INVALID_TRANSITION', 'A started request cannot be cancelled');
  }
  announceCleaning(job.departmentId);
  const row = await db.cleaningRequest.findUniqueOrThrow({
    where: { id },
    include: requestInclude,
  });
  return { ...toView(row, nurseId), mine: true };
}
