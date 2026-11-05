import { ACTIVE_BOOKING_STATUSES, type BookingView, type CreateBookingData } from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { changeRoomStatus } from './roomStatus.service.js';

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
    const room = await tx.operatingRoom.findUnique({
      where: { id: operatingRoomId },
      select: { status: true },
    });
    if (!room) throw new HttpError(404, 'NOT_FOUND', 'Operating room not found');
    if (room.status === 'OUT_OF_SERVICE') {
      throw new HttpError(409, 'ROOM_OUT_OF_SERVICE', 'This room is out of service');
    }
    // One booking at a time per room: the second waits, then sees the first.
    await tx.$queryRaw`SELECT id FROM "OperatingRoom" WHERE id = ${operatingRoomId}::uuid FOR UPDATE`;
    const clash = await tx.operationBooking.findFirst({
      where: {
        operatingRoomId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
      select: { startsAt: true, endsAt: true },
    });
    if (clash) {
      throw new HttpError(409, 'BOOKING_CONFLICT', 'The room is booked at that time', {
        conflict: { startsAt: clash.startsAt.toISOString(), endsAt: clash.endsAt.toISOString() },
      });
    }
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
    if (room.status === 'AVAILABLE') {
      await changeRoomStatus(tx, {
        hospitalId,
        roomId: operatingRoomId,
        to: 'BOOKED',
        actorId: doctorId,
        bookingId: created.id,
      });
    }
    return created;
  });
  return toView(booking, doctorId);
}

/** Every booking that overlaps the range, for the schedule (all rooms). */
export async function listBookings(db: ScopedPrisma, viewerId: string, from: Date, to: Date) {
  const bookings = await db.operationBooking.findMany({
    where: { status: { not: 'CANCELLED' }, startsAt: { lt: to }, endsAt: { gt: from } },
    include: bookingInclude,
    orderBy: { startsAt: 'asc' },
  });
  return bookings.map((booking) => toView(booking, viewerId));
}

/** My bookings that are still to come or happening now. */
export async function myBookings(db: ScopedPrisma, doctorId: string) {
  const bookings = await db.operationBooking.findMany({
    where: {
      surgeonId: doctorId,
      status: { in: ['SCHEDULED', 'POSTPONED', 'IN_PROGRESS'] },
      endsAt: { gt: new Date() },
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
    const roomId = booking.operatingRoomId;
    if (roomId) {
      const [room, waiting] = await Promise.all([
        tx.operatingRoom.findUnique({ where: { id: roomId }, select: { status: true } }),
        tx.operationBooking.count({
          where: { operatingRoomId: roomId, status: 'SCHEDULED', endsAt: { gt: new Date() } },
        }),
      ]);
      if (room?.status === 'BOOKED' && waiting === 0) {
        await changeRoomStatus(tx, {
          hospitalId,
          roomId,
          to: 'AVAILABLE',
          actorId: doctorId,
          bookingId: id,
        });
      }
    }
    return toView(cancelled, doctorId);
  });
}
