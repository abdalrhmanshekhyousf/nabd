import {
  addLocalDays,
  BOOKING_DAYS_AHEAD,
  cutSlots,
  zonedDate,
  type AppointmentStatus,
  type BookAppointmentData,
  type DaySlots,
  type Role,
} from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

/** The patient record behind a PATIENT account, or 403. */
export async function patientOfUser(db: ScopedPrisma, userId: string) {
  const patient = await db.patient.findFirst({ where: { userId }, select: { id: true } });
  if (!patient) throw new HttpError(403, 'FORBIDDEN', 'This account has no patient record');
  return patient.id;
}

async function requireDoctor(db: ScopedPrisma, doctorId: string) {
  const doctor = await db.user.findFirst({
    where: { id: doctorId, role: 'DOCTOR', isActive: true },
    select: {
      fullName: true,
      doctorProfile: { select: { visitMinutes: true } },
      scheduleDays: { select: { weekday: true, startMinute: true, endMinute: true } },
    },
  });
  if (!doctor) throw new HttpError(404, 'NOT_FOUND', 'Doctor not found');
  return { ...doctor, visitMinutes: doctor.doctorProfile?.visitMinutes ?? 20 };
}

/**
 * A doctor's free slots (task 3.20): their week cut into visits over the
 * coming days, in hospital time, without the past and the booked ones.
 */
export async function freeSlots(
  db: ScopedPrisma,
  doctorId: string,
  { from, days }: { from?: string; days: number },
  now = new Date(),
): Promise<DaySlots[]> {
  const doctor = await requireDoctor(db, doctorId);
  const today = zonedDate(now);
  const start = from && from > today ? from : today;
  const last = addLocalDays(today, BOOKING_DAYS_AHEAD);
  const span = Math.max(0, Math.min(days, daysBetween(start, last) + 1));
  const all = cutSlots(doctor.scheduleDays, doctor.visitMinutes, start, span);
  if (all.length === 0) return [];
  const booked = await db.appointment.findMany({
    where: {
      doctorId,
      status: 'BOOKED',
      startsAt: {
        gte: new Date(all[0]!.slots[0]?.startsAt ?? now),
        lte: new Date(all.at(-1)!.slots.at(-1)?.startsAt ?? now),
      },
    },
    select: { startsAt: true },
  });
  const taken = new Set(booked.map((b) => b.startsAt.toISOString()));
  return all
    .map((day) => ({
      ...day,
      slots: day.slots.filter(
        (slot) => Date.parse(slot.startsAt) > now.getTime() && !taken.has(slot.startsAt),
      ),
    }))
    .filter((day) => day.slots.length > 0);
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Books a slot (task 3.20). The time must be one of the doctor's slots, in the
 * future and within the booking window; the patient may not be in two places
 * at once. Two people taking the same slot together: the database lets one in
 * (partial unique index), the other is told it is taken.
 */
export async function bookAppointment(
  db: ScopedPrisma,
  hospitalId: string,
  booker: { userId: string; role: Role },
  { doctorId, patientId, startsAt, reason }: BookAppointmentData,
  now = new Date(),
) {
  const forPatient = booker.role === 'PATIENT' ? await patientOfUser(db, booker.userId) : patientId;
  if (!forPatient) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Choose the patient', {
      issues: [{ path: ['patientId'], message: 'validation.required' }],
    });
  }
  const patient = await db.patient.findUnique({ where: { id: forPatient }, select: { id: true } });
  if (!patient) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');

  const doctor = await requireDoctor(db, doctorId);
  const at = new Date(startsAt);
  const date = zonedDate(at);
  const slot = cutSlots(doctor.scheduleDays, doctor.visitMinutes, date, 1)[0]?.slots.find(
    (s) => s.startsAt === at.toISOString(),
  );
  const tooFar = date > addLocalDays(zonedDate(now), BOOKING_DAYS_AHEAD);
  if (!slot || at.getTime() <= now.getTime() || tooFar) {
    throw new HttpError(409, 'SLOT_UNAVAILABLE', 'This time is not one of the doctor’s slots');
  }
  const endsAt = new Date(slot.endsAt);
  const clash = await db.appointment.findFirst({
    where: {
      patientId: forPatient,
      status: 'BOOKED',
      startsAt: { lt: endsAt },
      endsAt: { gt: at },
    },
    select: { id: true },
  });
  if (clash) throw new HttpError(409, 'PATIENT_BUSY', 'The patient has another visit then');

  try {
    const appointment = await db.appointment.create({
      data: {
        hospitalId,
        doctorId,
        doctorName: doctor.fullName,
        patientId: forPatient,
        startsAt: at,
        endsAt,
        reason,
        bookedById: booker.userId,
      },
    });
    return toAppointmentView(appointment);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'SLOT_TAKEN', 'Someone just booked this time');
    }
    throw error;
  }
}

export function toAppointmentView(row: {
  id: string;
  doctorId: string | null;
  doctorName: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  reason: string | null;
}) {
  return {
    id: row.id,
    doctorId: row.doctorId,
    doctorName: row.doctorName,
    patientId: row.patientId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    reason: row.reason,
  };
}
