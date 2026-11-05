import {
  ACTIVE_BOOKING_STATUSES,
  type BookingView,
  type CreateBookingData,
  type EmergencyBookingData,
  type RescheduleBookingData,
} from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sendNotification } from './notification.service.js';
import { orActorsOf } from './orTransition.service.js';
import { changeRoomStatus } from './roomStatus.service.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

const bookingInclude = {
  operatingRoom: { select: { id: true, name: true } },
  patient: {
    select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
  },
} as const satisfies Prisma.OperationBookingInclude;

type BookingRow = Prisma.OperationBookingGetPayload<{ include: typeof bookingInclude }>;

/** Another doctor's booking shows only that the room is taken, not for whom. */
function toView(booking: BookingRow, viewerId: string): BookingView {
  const mine = booking.surgeonId === viewerId || booking.bookedById === viewerId;
  return {
    id: booking.id,
    kind: booking.kind,
    status: booking.status,
    operatingRoom: booking.operatingRoom,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    surgeonName: booking.surgeonName,
    mine,
    procedure: mine ? booking.procedure : null,
    patient:
      mine && booking.patient
        ? { ...booking.patient, dateOfBirth: booking.patient.dateOfBirth?.toISOString() ?? null }
        : null,
  };
}

/**
 * Locks the room row until the transaction ends, so two bookings of the same
 * room never check for clashes at the same time, and returns its status.
 */
async function lockRoom(tx: Tx, roomId: string) {
  await tx.$queryRaw`SELECT id FROM "OperatingRoom" WHERE id = ${roomId}::uuid FOR UPDATE`;
  const room = await tx.operatingRoom.findUnique({
    where: { id: roomId },
    select: { status: true, name: true },
  });
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
  if (room.status === 'OUT_OF_SERVICE') {
    throw new HttpError(409, 'ROOM_OUT_OF_SERVICE', 'This room is out of service');
  }
  return room;
}

/** The bookings holding the room for part of [start, end). */
function holding(roomId: string, start: Date, end: Date, exceptId?: string) {
  return {
    operatingRoomId: roomId,
    status: { in: [...ACTIVE_BOOKING_STATUSES] },
    startsAt: { lt: end },
    endsAt: { gt: start },
    ...(exceptId ? { id: { not: exceptId } } : {}),
  } satisfies Prisma.OperationBookingWhereInput;
}

async function refuseClash(tx: Tx, where: Prisma.OperationBookingWhereInput) {
  const clash = await tx.operationBooking.findFirst({
    where,
    select: { startsAt: true, endsAt: true },
  });
  if (clash) {
    throw new HttpError(409, 'BOOKING_CONFLICT', 'The room is booked at that time', {
      conflict: { startsAt: clash.startsAt.toISOString(), endsAt: clash.endsAt.toISOString() },
    });
  }
}

/** A free room becomes booked by this booking. */
async function holdRoom(
  tx: Tx,
  hospitalId: string,
  room: { id: string; status: string },
  actorId: string,
  bookingId: string,
) {
  if (room.status === 'AVAILABLE') {
    await changeRoomStatus(tx, { hospitalId, roomId: room.id, to: 'BOOKED', actorId, bookingId });
  }
}

/** A booked room with nothing else lined up is free again. */
async function releaseIfIdle(
  tx: Tx,
  hospitalId: string,
  roomId: string,
  actorId: string,
  bookingId: string,
) {
  const [room, waiting] = await Promise.all([
    tx.operatingRoom.findUnique({ where: { id: roomId }, select: { status: true } }),
    tx.operationBooking.count({
      where: { operatingRoomId: roomId, status: 'SCHEDULED', endsAt: { gt: new Date() } },
    }),
  ]);
  if (room?.status === 'BOOKED' && waiting === 0) {
    await changeRoomStatus(tx, { hospitalId, roomId, to: 'AVAILABLE', actorId, bookingId });
  }
}

/**
 * A doctor books an operating room for one of their patients (task 2.20). The
 * room row is locked while checking, so two doctors booking the same slot at
 * the same moment cannot both get it. A free room becomes "booked".
 */
export async function createBooking(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  { operatingRoomId, patientId, procedure, startsAt, durationMinutes, notes }: CreateBookingData,
) {
  const [doctor, record] = await Promise.all([
    db.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }),
    db.medicalRecord.findFirst({ where: { patientId, doctorId }, select: { id: true } }),
  ]);
  if (!doctor || !record) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const booking = await db.$transaction(async (tx) => {
    const room = await lockRoom(tx, operatingRoomId);
    await refuseClash(tx, holding(operatingRoomId, start, end));
    const created = await tx.operationBooking.create({
      data: {
        hospitalId,
        operatingRoomId,
        patientId,
        surgeonId: doctorId,
        surgeonName: doctor.fullName,
        bookedById: doctorId,
        procedure,
        notes,
        startsAt: start,
        endsAt: end,
      },
      include: bookingInclude,
    });
    await holdRoom(tx, hospitalId, { id: operatingRoomId, ...room }, doctorId, created.id);
    return created;
  });
  return toView(booking, doctorId);
}

/** Who the emergency is for and who operates: from an ER visit, or my own patient. */
async function emergencyPatient(
  db: ScopedPrisma,
  actorId: string,
  { visitId, patientId }: Pick<EmergencyBookingData, 'visitId' | 'patientId'>,
) {
  const actors = await orActorsOf(db, actorId);
  const isDoctor = actors.includes('DOCTOR');
  if (visitId) {
    if (!isDoctor && !actors.includes('ER_NURSE')) {
      throw new HttpError(403, 'FORBIDDEN', 'Only ER nurses and doctors book emergencies');
    }
    const visit = await db.triageAssessment.findFirst({
      where: { id: visitId, status: { in: ['WAITING', 'IN_TREATMENT'] } },
      select: {
        patientId: true,
        patient: { select: { medicalRecord: { select: { doctorId: true } } } },
      },
    });
    if (!visit) throw new HttpError(404, 'NOT_FOUND', 'Emergency visit not found');
    // A doctor booking it operates; from a nurse, the patient's doctor if there is one.
    const surgeonId = isDoctor ? actorId : (visit.patient.medicalRecord?.doctorId ?? null);
    return { patientId: visit.patientId, triageId: visitId, surgeonId };
  }
  if (!isDoctor) {
    throw new HttpError(403, 'FORBIDDEN', 'Nurses book emergencies from the ER visit');
  }
  const record = await db.medicalRecord.findFirst({
    where: { patientId: patientId ?? undefined, doctorId: actorId },
    select: { patientId: true },
  });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  return { patientId: record.patientId, triageId: null, surgeonId: actorId };
}

/**
 * An emergency operation, starting now (task 2.21). It takes priority: the
 * scheduled bookings in its way are postponed and their doctors told at once.
 * A room in surgery or sterilization cannot take it, nor can another
 * emergency or an operation already going on at that time.
 */
export async function createEmergencyBooking(
  db: ScopedPrisma,
  hospitalId: string,
  actorId: string,
  input: EmergencyBookingData,
) {
  const { operatingRoomId, procedure, durationMinutes, notes } = input;
  const who = await emergencyPatient(db, actorId, input);
  const surgeon = who.surgeonId
    ? await db.user.findUnique({ where: { id: who.surgeonId }, select: { fullName: true } })
    : null;
  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const { booking, postponed, roomName } = await db.$transaction(async (tx) => {
    const room = await lockRoom(tx, operatingRoomId);
    if (room.status !== 'AVAILABLE' && room.status !== 'BOOKED') {
      throw new HttpError(409, 'ROOM_BUSY', 'The room is in use right now', {
        status: room.status,
      });
    }
    const inTheWay = holding(operatingRoomId, start, end);
    await refuseClash(tx, { ...inTheWay, OR: [{ kind: 'EMERGENCY' }, { status: 'IN_PROGRESS' }] });
    const postponed = await tx.operationBooking.findMany({
      where: { ...inTheWay, kind: 'SCHEDULED', status: 'SCHEDULED' },
      select: { id: true, surgeonId: true, procedure: true },
    });
    if (postponed.length > 0) {
      await tx.operationBooking.updateMany({
        where: { id: { in: postponed.map((b) => b.id) } },
        data: { status: 'POSTPONED' },
      });
    }
    const created = await tx.operationBooking.create({
      data: {
        hospitalId,
        operatingRoomId,
        patientId: who.patientId,
        triageId: who.triageId,
        surgeonId: who.surgeonId,
        surgeonName: surgeon?.fullName ?? '',
        bookedById: actorId,
        kind: 'EMERGENCY',
        procedure,
        notes,
        startsAt: start,
        endsAt: end,
      },
      include: bookingInclude,
    });
    await holdRoom(tx, hospitalId, { id: operatingRoomId, ...room }, actorId, created.id);
    return { booking: created, postponed, roomName: room.name };
  });

  for (const moved of postponed) {
    if (!moved.surgeonId || moved.surgeonId === actorId) continue;
    await sendNotification(db, hospitalId, {
      to: { userIds: [moved.surgeonId] },
      type: 'OPERATION_POSTPONED',
      data: { procedure: moved.procedure, room: roomName },
      link: '/doctor/or-bookings',
    });
  }
  return { booking: toView(booking, actorId), postponed: postponed.length };
}

/**
 * The doctor moves their booking to a new time or room, e.g. after an
 * emergency postponed it (task 2.21). The same clash rules apply.
 */
export async function rescheduleBooking(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
  { operatingRoomId, startsAt, durationMinutes }: RescheduleBookingData,
) {
  const current = await db.operationBooking.findFirst({
    where: { id, surgeonId: doctorId, kind: 'SCHEDULED' },
    select: { status: true, operatingRoomId: true },
  });
  if (!current) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
  if (current.status !== 'SCHEDULED' && current.status !== 'POSTPONED') {
    throw new HttpError(409, 'INVALID_TRANSITION', 'Only a booking that has not started can move');
  }
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const booking = await db.$transaction(async (tx) => {
    const room = await lockRoom(tx, operatingRoomId);
    await refuseClash(tx, holding(operatingRoomId, start, end, id));
    const moved = await tx.operationBooking.update({
      where: { id },
      data: { operatingRoomId, startsAt: start, endsAt: end, status: 'SCHEDULED' },
      include: bookingInclude,
    });
    await holdRoom(tx, hospitalId, { id: operatingRoomId, ...room }, doctorId, id);
    if (current.operatingRoomId && current.operatingRoomId !== operatingRoomId) {
      await releaseIfIdle(tx, hospitalId, current.operatingRoomId, doctorId, id);
    }
    return moved;
  });
  return toView(booking, doctorId);
}

/** Every booking holding a room during the range, for the schedule (all rooms). */
export async function listBookings(db: ScopedPrisma, viewerId: string, from: Date, to: Date) {
  const bookings = await db.operationBooking.findMany({
    where: {
      status: { notIn: ['CANCELLED', 'POSTPONED'] },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    include: bookingInclude,
    orderBy: { startsAt: 'asc' },
  });
  return bookings.map((booking) => toView(booking, viewerId));
}

/** My bookings still to come or going on now, and every postponed one. */
export async function myBookings(db: ScopedPrisma, doctorId: string) {
  const bookings = await db.operationBooking.findMany({
    where: {
      surgeonId: doctorId,
      OR: [
        { status: 'POSTPONED' },
        { status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, endsAt: { gt: new Date() } },
      ],
    },
    include: bookingInclude,
    orderBy: { startsAt: 'asc' },
  });
  return bookings.map((booking) => toView(booking, doctorId));
}

/**
 * The doctor cancels their own booking that has not started. The room is free
 * again when nothing else is lined up for it.
 */
export async function cancelBooking(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
) {
  const booking = await db.operationBooking.findFirst({
    where: { id, surgeonId: doctorId },
    select: { status: true, operatingRoomId: true },
  });
  if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
  if (booking.status !== 'SCHEDULED' && booking.status !== 'POSTPONED') {
    throw new HttpError(
      409,
      'INVALID_TRANSITION',
      'Only a booking that has not started can be cancelled',
    );
  }
  return db.$transaction(async (tx) => {
    const cancelled = await tx.operationBooking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: bookingInclude,
    });
    if (booking.operatingRoomId) {
      await releaseIfIdle(tx, hospitalId, booking.operatingRoomId, doctorId, id);
    }
    return toView(cancelled, doctorId);
  });
}
