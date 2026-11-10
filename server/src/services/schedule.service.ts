import type { DoctorScheduleView, ScheduleData } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';

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
  const days = await db.doctorSchedule.findMany({
    where: { doctorId },
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: { weekday: 'asc' },
  });
  return { days, visitMinutes };
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
