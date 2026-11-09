import { BED_STATUSES_IN_USE, MAX_BEDS_PER_ROOM, type BedStatus } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { changeBedStatus } from './bedStatus.service.js';

const roomSelect = {
  id: true,
  number: true,
  floor: true,
  departmentId: true,
  beds: {
    select: { id: true, label: true, status: true, statusChangedAt: true },
    orderBy: { id: 'asc' },
  },
} as const satisfies Prisma.RoomSelect;

type RoomRow = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;

const naturally = new Intl.Collator('en', { numeric: true });

/** Beds in natural order (2 before 10), rooms likewise by number. */
function sortRoom(room: RoomRow) {
  return { ...room, beds: [...room.beds].sort((a, b) => naturally.compare(a.label, b.label)) };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const inUse = (status: BedStatus) => BED_STATUSES_IN_USE.includes(status);

async function requireDepartment(db: ScopedPrisma, departmentId: string) {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
}

/** Rooms with their beds, of one department or of the whole hospital. */
export async function listRooms(db: ScopedPrisma, departmentId?: string) {
  const rooms = await db.room.findMany({
    where: departmentId ? { departmentId } : undefined,
    select: roomSelect,
  });
  return rooms.map(sortRoom).sort((a, b) => naturally.compare(a.number, b.number));
}

/** Creates a room with its first beds, labelled 1, 2, 3... */
export async function createRoom(
  db: ScopedPrisma,
  hospitalId: string,
  input: { departmentId: string; number: string; floor: number | null; bedCount: number },
) {
  await requireDepartment(db, input.departmentId);
  try {
    const room = await db.room.create({
      data: {
        hospitalId,
        departmentId: input.departmentId,
        number: input.number,
        floor: input.floor,
        // Nested writes are not rewritten by the scoped client: hospitalId explicitly.
        beds: {
          create: Array.from({ length: input.bedCount }, (_, index) => ({
            hospitalId,
            label: String(index + 1),
          })),
        },
      },
      select: roomSelect,
    });
    return sortRoom(room);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'ROOM_EXISTS', input.number);
    throw error;
  }
}

export async function updateRoom(
  db: ScopedPrisma,
  id: string,
  input: { number: string; floor: number | null },
) {
  try {
    return sortRoom(await db.room.update({ where: { id }, data: input, select: roomSelect }));
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'ROOM_EXISTS', input.number);
    throw error;
  }
}

/** Deletes a room and its beds, unless a patient is in (or booked into) one of them. */
export async function deleteRoom(db: ScopedPrisma, id: string) {
  const room = await db.room.findUnique({ where: { id }, select: roomSelect });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room not found');
  if (room.beds.some((bed) => inUse(bed.status))) {
    throw new HttpError(409, 'ROOM_IN_USE', `Room ${room.number} has beds in use`);
  }
  await db.room.delete({ where: { id } });
}

/** Adds a bed; without a label it takes the lowest free number. */
export async function addBed(
  db: ScopedPrisma,
  hospitalId: string,
  roomId: string,
  label: string | undefined,
) {
  const room = await db.room.findUnique({ where: { id: roomId }, select: roomSelect });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Room not found');
  if (room.beds.length >= MAX_BEDS_PER_ROOM) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Too many beds', [
      { path: ['label'], code: 'too_big', message: 'validation.tooMany' },
    ]);
  }

  const used = new Set(room.beds.map((bed) => bed.label));
  let next = label;
  if (!next) {
    // The lowest free number, so a removed bed's number is reused.
    let number = 1;
    while (used.has(String(number))) number += 1;
    next = String(number);
  }

  try {
    await db.bed.create({ data: { hospitalId, roomId, label: next } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'BED_EXISTS', next);
    throw error;
  }
  return sortRoom((await db.room.findUnique({ where: { id: roomId }, select: roomSelect }))!);
}

async function requireBed(db: ScopedPrisma, id: string) {
  const bed = await db.bed.findUnique({ where: { id }, select: { status: true, roomId: true } });
  if (!bed) throw new HttpError(404, 'NOT_FOUND', 'Bed not found');
  return bed;
}

export async function deleteBed(db: ScopedPrisma, id: string) {
  const bed = await requireBed(db, id);
  if (inUse(bed.status)) throw new HttpError(409, 'BED_IN_USE', 'Bed in use');
  await db.bed.delete({ where: { id } });
}

/**
 * The admin takes a bed out of service (maintenance) or brings it back empty,
 * through the bed's state machine so it is logged (task 3.15). Everyday changes
 * (reserved, occupied, cleaning) are the nurses' (3.16).
 */
export async function setBedOutOfService(
  db: ScopedPrisma,
  hospitalId: string,
  actorId: string,
  id: string,
  outOfService: boolean,
) {
  const bed = await requireBed(db, id);
  if (inUse(bed.status)) throw new HttpError(409, 'BED_IN_USE', 'Bed in use');

  const status: BedStatus = outOfService ? 'OUT_OF_SERVICE' : 'EMPTY';
  if (bed.status !== status) {
    await db.$transaction((tx) =>
      changeBedStatus(tx, { hospitalId, bedId: id, to: status, actorId }),
    );
  }
  return sortRoom((await db.room.findUnique({ where: { id: bed.roomId }, select: roomSelect }))!);
}
