import { checkTransition, type OperatingRoomStatus, type OrActor } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { changeRoomStatus } from './roomStatus.service.js';

/**
 * How this person works the operating rooms (task 2.19): from their role, and
 * for nurses and cleaners from the departments they work in.
 */
export async function orActorsOf(db: ScopedPrisma, userId: string): Promise<OrActor[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      staffProfile: { select: { department: { select: { code: true } } } },
      cleanerAssignments: { select: { department: { select: { code: true } } } },
    },
  });
  if (!user) return [];
  const department = user.staffProfile?.department?.code;
  switch (user.role) {
    case 'ADMIN':
      return ['ADMIN'];
    case 'DOCTOR':
      return ['DOCTOR'];
    case 'NURSE':
      return department === 'EMERGENCY'
        ? ['ER_NURSE']
        : department === 'OPERATIONS'
          ? ['OR_NURSE']
          : [];
    case 'CLEANER':
      return user.cleanerAssignments.some((a) => a.department.code === 'OPERATIONS')
        ? ['STERILIZER']
        : [];
    default:
      return [];
  }
}

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

/**
 * What a step of the operating room nurse does to the room's booking (task
 * 2.22): preparing takes the booking (the one chosen, or the first waiting,
 * emergencies first) into progress; starting the operation stamps when; ending
 * it completes the booking. Returns the booking the step belongs to.
 */
async function moveBooking(
  tx: Tx,
  roomId: string,
  to: OperatingRoomStatus,
  chosenId: string | null,
): Promise<string | null> {
  const now = new Date();
  if (to === 'PREPARING') {
    const where: Prisma.OperationBookingWhereInput = {
      operatingRoomId: roomId,
      status: 'SCHEDULED',
      endsAt: { gt: now },
    };
    const next = await tx.operationBooking.findFirst({
      where: chosenId ? { ...where, id: chosenId } : where,
      orderBy: [{ kind: 'desc' }, { startsAt: 'asc' }],
      select: { id: true },
    });
    if (chosenId && !next) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
    if (!next) return null;
    await tx.operationBooking.update({ where: { id: next.id }, data: { status: 'IN_PROGRESS' } });
    return next.id;
  }
  if (to !== 'IN_SURGERY' && to !== 'AWAITING_STERILIZATION') return null;
  const current = await tx.operationBooking.findFirst({
    where: { operatingRoomId: roomId, status: 'IN_PROGRESS' },
    select: { id: true },
  });
  if (!current) return null;
  await tx.operationBooking.update({
    where: { id: current.id },
    data: to === 'IN_SURGERY' ? { startedAt: now } : { status: 'COMPLETED', endedAt: now },
  });
  return current.id;
}

/**
 * Moves an operating room to another state, if the state machine allows it for
 * this person, and records it in the room's history. Bookings (2.20, 2.21)
 * pass `viaBooking` for the moves that belong to them; the nurse's steps
 * carry the room's booking along (2.22). The room row is locked, so two people
 * pressing the same step at once cannot both make it.
 */
export async function transitionRoom(
  db: ScopedPrisma,
  {
    hospitalId,
    userId,
    roomId,
    to,
    viaBooking = false,
    bookingId = null,
  }: {
    hospitalId: string;
    userId: string;
    roomId: string;
    to: OperatingRoomStatus;
    viaBooking?: boolean;
    bookingId?: string | null;
  },
) {
  const actors = await orActorsOf(db, userId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OperatingRoom" WHERE id = ${roomId}::uuid FOR UPDATE`;
    const room = await tx.operatingRoom.findUnique({
      where: { id: roomId },
      select: { status: true },
    });
    if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
    const check = checkTransition(room.status, to, actors, { viaBooking });
    if (!check.ok) {
      if (check.reason === 'NOT_ALLOWED') {
        throw new HttpError(403, 'FORBIDDEN', 'You may not make this step');
      }
      throw new HttpError(
        409,
        check.reason === 'VIA_BOOKING' ? 'USE_BOOKING' : 'INVALID_TRANSITION',
        `${room.status} -> ${to}`,
        { from: room.status, to },
      );
    }
    const moved = viaBooking ? bookingId : await moveBooking(tx, roomId, to, bookingId);
    await changeRoomStatus(tx, { hospitalId, roomId, to, actorId: userId, bookingId: moved });
  });
  return db.operatingRoom.findUniqueOrThrow({
    where: { id: roomId },
    select: { id: true, name: true, status: true, statusChangedAt: true },
  });
}
