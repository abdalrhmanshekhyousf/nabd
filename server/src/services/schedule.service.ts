import {
  addLocalDays,
  zonedDate,
  zonedInstant,
  type DoctorScheduleView,
  type ScheduleData,
  type VacationData,
} from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from './notification.service.js';

/** A doctor of this hospital, with their visit length; others are "not found". */
async function requireDoctor(db: ScopedPrisma, doctorId: string) {
  const doctor = await db.user.findFirst({
    where: { id: doctorId, role: 'DOCTOR' },
    select: { doctorProfile: { select: { visitMinutes: true } } },
  });
  if (!doctor) throw new HttpError(404, 'NOT_FOUND', 'Doctor not found');
  return doctor.doctorProfile?.visitMinutes ?? 20;
}

/** A doctor's week (task 3.19): the days and hours the admin set, and their visit length. */
export async function doctorSchedule(
  db: ScopedPrisma,
  doctorId: string,
): Promise<DoctorScheduleView> {
  const visitMinutes = await requireDoctor(db, doctorId);
  const [days, vacations] = await Promise.all([
    db.doctorSchedule.findMany({
      where: { doctorId },
      select: { weekday: true, startMinute: true, endMinute: true },
      orderBy: { weekday: 'asc' },
    }),
    upcomingVacations(db, doctorId),
  ]);
  return { days, visitMinutes, vacations };
}

/**
 * The admin sets a doctor's working days and hours (task 3.19): changed days
 * are updated, new ones added, the ones left out removed. The doctor's page
 * updates live. Bookings already made keep their time (3.21 handles closing
 * slots that have patients).
 */
export async function saveSchedule(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  { days }: ScheduleData,
) {
  await requireDoctor(db, doctorId);
  await db.$transaction(async (tx) => {
    await tx.doctorSchedule.deleteMany({
      where: { doctorId, weekday: { notIn: days.map((d) => d.weekday) } },
    });
    for (const day of days) {
      await tx.doctorSchedule.upsert({
        where: { doctorId_weekday: { doctorId, weekday: day.weekday } },
        create: { hospitalId, doctorId, ...day },
        update: day,
      });
    }
  });
  emitRefresh(rooms.user(doctorId), [['schedule']]);
  return doctorSchedule(db, doctorId);
}

/** The doctor's own choice of how long a visit takes. */
export async function setVisitLength(db: ScopedPrisma, doctorId: string, visitMinutes: number) {
  await requireDoctor(db, doctorId);
  await db.doctorProfile.update({ where: { userId: doctorId }, data: { visitMinutes } });
  return doctorSchedule(db, doctorId);
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/** A local date as the @db.Date the database keeps. */
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** A doctor's vacations from today on (task 3.21), as local dates. */
export async function upcomingVacations(db: ScopedPrisma, doctorId: string) {
  const rows = await db.doctorVacation.findMany({
    where: { doctorId, endDate: { gte: asDate(zonedDate(new Date())) } },
    orderBy: { startDate: 'asc' },
  });
  return rows.map((v) => ({
    id: v.id,
    from: day(v.startDate),
    to: day(v.endDate),
    reason: v.reason,
  }));
}

/**
 * The admin puts a doctor on vacation (task 3.21): no slots are offered on
 * those days, and the visits already booked then are cancelled; each patient
 * with an account is told, so they can book again. Returns how many were
 * cancelled.
 */
export async function addVacation(
  db: ScopedPrisma,
  hospitalId: string,
  adminId: string,
  doctorId: string,
  { from, to, reason }: VacationData,
) {
  await requireDoctor(db, doctorId);
  if (to < zonedDate(new Date())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The vacation is over already', {
      issues: [{ path: ['to'], message: 'validation.invalid' }],
    });
  }
  const start = zonedInstant(from, 0);
  const end = zonedInstant(addLocalDays(to, 1), 0);
  const cancelled = await db.$transaction(async (tx) => {
    await tx.doctorVacation.create({
      data: {
        hospitalId,
        doctorId,
        startDate: asDate(from),
        endDate: asDate(to),
        reason,
        createdById: adminId,
      },
    });
    const hit = await tx.appointment.findMany({
      where: { doctorId, status: 'BOOKED', startsAt: { gte: start, lt: end } },
      select: { id: true, startsAt: true, doctorName: true, patient: { select: { userId: true } } },
    });
    await tx.appointment.updateMany({
      where: { id: { in: hit.map((a) => a.id) } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'DOCTOR_LEAVE' },
    });
    return hit;
  });
  for (const visit of cancelled) {
    if (!visit.patient.userId) continue;
    await sendNotification(db, hospitalId, {
      to: { userIds: [visit.patient.userId] },
      type: 'APPOINTMENT_CANCELLED',
      data: {
        doctor: visit.doctorName,
        startsAt: visit.startsAt.toISOString(),
        reason: 'DOCTOR_LEAVE',
      },
      link: '/patient/appointments',
    });
  }
  emitRefresh(rooms.user(doctorId), [['schedule'], ['appointments']]);
  emitRefresh(rooms.hospital(hospitalId), [['slots', doctorId]]);
  return { schedule: await doctorSchedule(db, doctorId), cancelled: cancelled.length };
}

/** The admin removes a vacation; its days are bookable again (cancelled visits stay cancelled). */
export async function removeVacation(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
) {
  const { count } = await db.doctorVacation.deleteMany({ where: { id, doctorId } });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Vacation not found');
  emitRefresh(rooms.user(doctorId), [['schedule']]);
  emitRefresh(rooms.hospital(hospitalId), [['slots', doctorId]]);
  return doctorSchedule(db, doctorId);
}
