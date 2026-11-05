import { checkTransition, type OperatingRoomStatus, type OrActor } from '@nabd/shared';
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

/**
 * Moves an operating room to another state, if the state machine allows it for
 * this person, and records it in the room's history. Bookings (2.20, 2.21)
 * pass `viaBooking` for the moves that belong to them.
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
  const room = await db.operatingRoom.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
  const check = checkTransition(room.status, to, await orActorsOf(db, userId), { viaBooking });
  if (!check.ok) {
    if (check.reason === 'NOT_ALLOWED') {
      throw new HttpError(403, 'FORBIDDEN', 'You may not make this step');
    }
    throw new HttpError(
      409,
      check.reason === 'VIA_BOOKING' ? 'USE_BOOKING' : 'INVALID_TRANSITION',
      `${room.status} -> ${to}`,
      {
        from: room.status,
        to,
      },
    );
  }
  await db.$transaction((tx) =>
    changeRoomStatus(tx, { hospitalId, roomId, to, actorId: userId, bookingId }),
  );
  return db.operatingRoom.findUniqueOrThrow({
    where: { id: roomId },
    select: { id: true, name: true, status: true, statusChangedAt: true },
  });
}
