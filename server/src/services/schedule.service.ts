import type { ScheduleData, ScheduleDay } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';

const daySelect = { weekday: true, startMinute: true, endMinute: true, slotMinutes: true } as const;

/** The doctor's working week (task 3.19), Sunday to Saturday; missing days are off. */
export async function mySchedule(db: ScopedPrisma, doctorId: string): Promise<ScheduleDay[]> {
  return db.doctorSchedule.findMany({
    where: { doctorId },
    select: daySelect,
    orderBy: { weekday: 'asc' },
  });
}

/**
 * Saves the doctor's week as given: changed days are updated, new ones added,
 * the ones left out removed. Bookings already made keep their time (3.21 deals
 * with closing slots that have patients).
 */
export async function saveSchedule(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  { days }: ScheduleData,
) {
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
  return mySchedule(db, doctorId);
}
