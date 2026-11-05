import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from './notification.service.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

/** What the sterilization team is told once the request is saved. */
export type SterilizationNotice = {
  departmentId: string;
  room: string;
  procedure: string | null;
};

/**
 * When an operation ends (task 2.23): a sterilization request for the room,
 * for the cleaners covering the operations department. One open request per
 * room is enough. Returns what to announce after the transaction, or null when
 * the hospital has no operations department to send it to.
 */
export async function requestSterilization(
  tx: Tx,
  {
    hospitalId,
    roomId,
    requestedById,
    bookingId,
  }: { hospitalId: string; roomId: string; requestedById: string; bookingId: string | null },
): Promise<SterilizationNotice | null> {
  const [operations, room, booking] = await Promise.all([
    tx.department.findFirst({ where: { code: 'OPERATIONS' }, select: { id: true } }),
    tx.operatingRoom.findUniqueOrThrow({ where: { id: roomId }, select: { name: true } }),
    bookingId
      ? tx.operationBooking.findUnique({ where: { id: bookingId }, select: { procedure: true } })
      : null,
  ]);
  if (!operations) return null;
  const open = await tx.cleaningRequest.findFirst({
    where: {
      operatingRoomId: roomId,
      kind: 'STERILIZATION',
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    select: { id: true },
  });
  if (!open) {
    await tx.cleaningRequest.create({
      data: {
        hospitalId,
        departmentId: operations.id,
        kind: 'STERILIZATION',
        operatingRoomId: roomId,
        place: room.name,
        requestedById,
      },
    });
  }
  return { departmentId: operations.id, room: room.name, procedure: booking?.procedure ?? null };
}

/** An urgent notice, with a sound, to every cleaner covering the operations department. */
export async function announceSterilization(
  db: ScopedPrisma,
  hospitalId: string,
  { departmentId, room, procedure }: SterilizationNotice,
) {
  await sendNotification(db, hospitalId, {
    to: { role: 'CLEANER', departmentId },
    type: 'OPERATION_ENDED',
    data: { room, procedure },
    link: '/cleaning/tasks',
  });
  // The cleaners' boards (2.24) list the new request.
  emitRefresh(rooms.department(departmentId), [['cleaning-requests']]);
}

/** Every cleaner board covering this department updates (task 2.24). */
export function announceCleaning(departmentId: string) {
  emitRefresh(rooms.department(departmentId), [['cleaning-requests']]);
}

/**
 * The room's sterilization has started (task 2.24): its open request is now
 * this worker's. A room sterilized without a request gets one, so the work is
 * on record. Returns the request's department.
 */
export async function startSterilization(tx: Tx, roomId: string, workerId: string) {
  const now = new Date();
  const open = await tx.cleaningRequest.findFirst({
    where: { operatingRoomId: roomId, kind: 'STERILIZATION', status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, departmentId: true },
  });
  if (open) {
    await tx.cleaningRequest.update({
      where: { id: open.id },
      data: { status: 'IN_PROGRESS', assignedToId: workerId, startedAt: now },
    });
    return open.departmentId;
  }
  const [operations, room] = await Promise.all([
    tx.department.findFirst({ where: { code: 'OPERATIONS' }, select: { id: true } }),
    tx.operatingRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { name: true, hospitalId: true },
    }),
  ]);
  if (!operations) return null;
  await tx.cleaningRequest.create({
    data: {
      hospitalId: room.hospitalId,
      departmentId: operations.id,
      kind: 'STERILIZATION',
      status: 'IN_PROGRESS',
      operatingRoomId: roomId,
      place: room.name,
      assignedToId: workerId,
      startedAt: now,
    },
  });
  return operations.id;
}

/** The room is sterilized: its open request is done. Returns the request's department. */
export async function finishSterilization(tx: Tx, roomId: string) {
  const open = await tx.cleaningRequest.findFirst({
    where: {
      operatingRoomId: roomId,
      kind: 'STERILIZATION',
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    select: { id: true, departmentId: true },
  });
  if (!open) return null;
  await tx.cleaningRequest.update({
    where: { id: open.id },
    data: { status: 'DONE', finishedAt: new Date() },
  });
  return open.departmentId;
}
