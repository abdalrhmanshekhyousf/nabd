import { OPERATING_ROOM_IDLE, type OperatingRoomStatus } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const operatingRoomSelect = {
  id: true,
  name: true,
  status: true,
  statusChangedAt: true,
} as const satisfies Prisma.OperatingRoomSelect;

const naturally = new Intl.Collator('ar', { numeric: true });

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Booked, being prepared, in surgery or being sterilized: hands off. */
const busy = (status: OperatingRoomStatus) => !OPERATING_ROOM_IDLE.includes(status);

async function requireIdle(db: ScopedPrisma, id: string) {
  const room = await db.operatingRoom.findUnique({ where: { id }, select: operatingRoomSelect });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
  if (busy(room.status)) {
    throw new HttpError(409, 'OPERATING_ROOM_IN_USE', `Operating room is ${room.status}`);
  }
  return room;
}

/** All operating rooms of the hospital, in natural name order (2 before 10). */
export async function listOperatingRooms(db: ScopedPrisma) {
  const rooms = await db.operatingRoom.findMany({ select: operatingRoomSelect });
  return rooms.sort((a, b) => naturally.compare(a.name, b.name));
}

export async function createOperatingRoom(db: ScopedPrisma, hospitalId: string, name: string) {
  try {
    return await db.operatingRoom.create({
      data: { hospitalId, name },
      select: operatingRoomSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'OPERATING_ROOM_EXISTS', name);
    throw error;
  }
}

export async function renameOperatingRoom(db: ScopedPrisma, id: string, name: string) {
  await requireIdle(db, id);
  try {
    return await db.operatingRoom.update({
      where: { id },
      data: { name },
      select: operatingRoomSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'OPERATING_ROOM_EXISTS', name);
    throw error;
  }
}

/**
 * The admin takes an idle room out of service for maintenance, or brings it back
 * as available (task 1.26). Every other transition belongs to the state machine
 * of task 2.19.
 */
export async function setOperatingRoomService(db: ScopedPrisma, id: string, outOfService: boolean) {
  const room = await requireIdle(db, id);
  const status: OperatingRoomStatus = outOfService ? 'OUT_OF_SERVICE' : 'AVAILABLE';
  if (room.status === status) return room;
  return db.operatingRoom.update({
    where: { id },
    data: { status, statusChangedAt: new Date() },
    select: operatingRoomSelect,
  });
}

export async function deleteOperatingRoom(db: ScopedPrisma, id: string) {
  await requireIdle(db, id);
  await db.operatingRoom.delete({ where: { id } });
}
