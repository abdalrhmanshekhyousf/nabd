import type { OperatingRoomStatus } from '../generated/prisma/enums.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

/**
 * The one way an operating room changes status (task 2.18): the room is
 * updated and the change is written to its history, with who made it and,
 * when it belongs to one, the booking. The state machine (2.19) decides which
 * changes are allowed; this only records them.
 */
export async function changeRoomStatus(
  tx: Tx,
  {
    hospitalId,
    roomId,
    to,
    actorId,
    bookingId = null,
  }: {
    hospitalId: string;
    roomId: string;
    to: OperatingRoomStatus;
    actorId: string;
    bookingId?: string | null;
  },
) {
  // One connection per transaction: one query after another.
  const room = await tx.operatingRoom.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
  if (room.status === to) return null;

  await tx.operatingRoomStatusChange.create({
    data: {
      hospitalId,
      operatingRoomId: roomId,
      bookingId,
      fromStatus: room.status,
      toStatus: to,
      changedById: actorId,
      changedByName: actor?.fullName ?? '—',
    },
  });
  return tx.operatingRoom.update({
    where: { id: roomId },
    data: { status: to, statusChangedAt: new Date() },
  });
}

/** An operating room's history, newest first. */
export async function roomHistory(db: ScopedPrisma, roomId: string, take = 50) {
  const room = await db.operatingRoom.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
  const changes = await db.operatingRoomStatusChange.findMany({
    where: { operatingRoomId: roomId },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return changes.map((change) => ({
    id: change.id,
    fromStatus: change.fromStatus,
    toStatus: change.toStatus,
    changedByName: change.changedByName,
    bookingId: change.bookingId,
    createdAt: change.createdAt.toISOString(),
  }));
}
