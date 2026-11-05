import { checkTransition, type OperatingRoomStatus, type OrActor } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  announceCleaning,
  announceSterilization,
  finishSterilization,
  requestSterilization,
  startSterilization,
  type SterilizationNotice,
} from './cleaning.service.js';
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
 * Once sterilized, a room with bookings still waiting is held for the next of
 * them again instead of standing free (task 2.24).
 */
async function holdForNext(tx: Tx, hospitalId: string, roomId: string, userId: string) {
  const next = await tx.operationBooking.findFirst({
    where: { operatingRoomId: roomId, status: 'SCHEDULED', endsAt: { gt: new Date() } },
    orderBy: [{ kind: 'desc' }, { startsAt: 'asc' }],
    select: { id: true, bookedById: true },
  });
  if (!next) return;
  await changeRoomStatus(tx, {
    hospitalId,
    roomId,
    to: 'BOOKED',
    actorId: next.bookedById ?? userId,
    bookingId: next.id,
  });
}

/** What a room step leaves to announce once its transaction is saved. */
export type StepEffects = {
  /** The operation ended: call the sterilization team (2.23). */
  sterilize: SterilizationNotice | null;
  /** A cleaning request changed in this department (2.24). */
  cleaningDepartmentId: string | null;
};

/**
 * One step of an operating room, inside the caller's transaction: checks the
 * state machine for this person, carries the booking (2.22) and the
 * sterilization request (2.23, 2.24) along, and records it in the history.
 * The room row is locked, so two people pressing the same step at once cannot
 * both make it.
 */
export async function stepRoom(
  tx: Tx,
  {
    hospitalId,
    userId,
    actors,
    roomId,
    to,
    viaBooking = false,
    bookingId = null,
  }: {
    hospitalId: string;
    userId: string;
    actors: OrActor[];
    roomId: string;
    to: OperatingRoomStatus;
    viaBooking?: boolean;
    bookingId?: string | null;
  },
): Promise<StepEffects> {
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

  if (to === 'AWAITING_STERILIZATION') {
    const sterilize = await requestSterilization(tx, {
      hospitalId,
      roomId,
      requestedById: userId,
      bookingId: moved,
    });
    return { sterilize, cleaningDepartmentId: null };
  }
  if (to === 'STERILIZING') {
    return { sterilize: null, cleaningDepartmentId: await startSterilization(tx, roomId, userId) };
  }
  if (room.status === 'STERILIZING' && to === 'AVAILABLE') {
    const cleaningDepartmentId = await finishSterilization(tx, roomId);
    await holdForNext(tx, hospitalId, roomId, userId);
    return { sterilize: null, cleaningDepartmentId };
  }
  return { sterilize: null, cleaningDepartmentId: null };
}

/** Tells everyone concerned about a saved room step. */
export async function announceStep(db: ScopedPrisma, hospitalId: string, effects: StepEffects) {
  if (effects.sterilize) await announceSterilization(db, hospitalId, effects.sterilize);
  if (effects.cleaningDepartmentId) announceCleaning(effects.cleaningDepartmentId);
}

/**
 * Moves an operating room to another state (task 2.19), in its own
 * transaction. Bookings (2.20, 2.21) pass `viaBooking` for the moves that
 * belong to them.
 */
export async function transitionRoom(
  db: ScopedPrisma,
  input: {
    hospitalId: string;
    userId: string;
    roomId: string;
    to: OperatingRoomStatus;
    viaBooking?: boolean;
    bookingId?: string | null;
  },
) {
  const actors = await orActorsOf(db, input.userId);
  const effects = await db.$transaction((tx) => stepRoom(tx, { ...input, actors }));
  await announceStep(db, input.hospitalId, effects);
  return db.operatingRoom.findUniqueOrThrow({
    where: { id: input.roomId },
    select: { id: true, name: true, status: true, statusChangedAt: true },
  });
}
