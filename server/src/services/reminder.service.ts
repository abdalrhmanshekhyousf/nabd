import {
  addLocalDays,
  zonedDate,
  zonedInstant,
  type MedicationReminderView,
  type MyMedication,
  type ReminderData,
  type ReminderUpdateData,
} from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { forHospital, type ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { patientOfUser } from './appointment.service.js';
import { sendNotification } from './notification.service.js';

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

type ReminderRow = Prisma.MedicationReminderGetPayload<object>;

export function toReminderView(row: ReminderRow): MedicationReminderView {
  return {
    id: row.id,
    prescriptionItemId: row.prescriptionItemId,
    drugName: row.drugName,
    dose: row.dose,
    times: row.times,
    startDate: day(row.startDate),
    endDate: row.endDate ? day(row.endDate) : null,
    active: row.active,
  };
}

/**
 * The patient's medicines (task 3.26): every medicine of their prescriptions of
 * the last 90 days, latest first, each with its reminder when one is set; and
 * the reminders of their own.
 */
export async function myMedications(db: ScopedPrisma, userId: string) {
  const patientId = await patientOfUser(db, userId);
  const [items, reminders] = await Promise.all([
    db.prescriptionItem.findMany({
      where: {
        prescription: {
          record: { patientId },
          status: { not: 'CANCELLED' },
          createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
        },
      },
      include: { prescription: { select: { doctorName: true, createdAt: true } } },
      orderBy: { prescription: { createdAt: 'desc' } },
    }),
    db.medicationReminder.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const medications: MyMedication[] = items.map((item) => {
    const reminder = reminders.find((r) => r.prescriptionItemId === item.id);
    return {
      prescriptionItemId: item.id,
      drugName: item.drugName,
      dose: item.dose,
      frequency: item.frequency,
      durationDays: item.durationDays,
      instructions: item.instructions,
      doctorName: item.prescription.doctorName,
      prescribedAt: item.prescription.createdAt.toISOString(),
      reminder: reminder ? toReminderView(reminder) : null,
    };
  });
  return { medications, reminders: reminders.map(toReminderView) };
}

/** The patient sets a reminder; for a prescribed medicine, one per medicine. */
export async function createReminder(
  db: ScopedPrisma,
  hospitalId: string,
  userId: string,
  { prescriptionItemId, ...data }: ReminderData,
) {
  const patientId = await patientOfUser(db, userId);
  if (prescriptionItemId) {
    const item = await db.prescriptionItem.findFirst({
      where: { id: prescriptionItemId, prescription: { record: { patientId } } },
      select: { id: true },
    });
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found');
    const existing = await db.medicationReminder.findFirst({
      where: { patientId, prescriptionItemId },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, 'ALREADY_PENDING', 'This medicine already has a reminder');
    }
  }
  const row = await db.medicationReminder.create({
    data: {
      hospitalId,
      patientId,
      prescriptionItemId,
      drugName: data.drugName,
      dose: data.dose,
      times: [...data.times].sort(),
      startDate: asDate(data.startDate),
      endDate: data.endDate ? asDate(data.endDate) : null,
    },
  });
  return toReminderView(row);
}

async function requireMine(db: ScopedPrisma, userId: string, id: string) {
  const patientId = await patientOfUser(db, userId);
  const row = await db.medicationReminder.findFirst({ where: { id, patientId } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Reminder not found');
  return row;
}

export async function updateReminder(
  db: ScopedPrisma,
  userId: string,
  id: string,
  { times, active }: ReminderUpdateData,
) {
  await requireMine(db, userId, id);
  const row = await db.medicationReminder.update({
    where: { id },
    data: { ...(times && { times: [...times].sort() }), ...(active !== undefined && { active }) },
  });
  return toReminderView(row);
}

export async function deleteReminder(db: ScopedPrisma, userId: string, id: string) {
  await requireMine(db, userId, id);
  await db.medicationReminder.delete({ where: { id } });
}

/** A dose is still worth reminding of this long after its time (a late server, a restart). */
const GRACE_MS = 15 * 60_000;

/**
 * Sends the reminders that are due (task 3.26), for every hospital: each dose
 * time of each active reminder, today in hospital time, from its time until
 * the grace period ends. A delivery row is written first, so a dose's reminder
 * goes out once even if this runs twice or on two servers.
 */
export async function runDueReminders(now = new Date()) {
  const today = zonedDate(now);
  const yesterday = addLocalDays(today, -1);
  const reminders = await prisma.medicationReminder.findMany({
    where: {
      active: true,
      startDate: { lte: asDate(today) },
      OR: [{ endDate: null }, { endDate: { gte: asDate(yesterday) } }],
      patient: { userId: { not: null } },
    },
    include: { patient: { select: { userId: true } } },
  });
  let sent = 0;
  for (const reminder of reminders) {
    // Yesterday too: a dose at 23:55 is still due just after midnight.
    for (const date of [yesterday, today]) {
      if (date < day(reminder.startDate)) continue;
      if (reminder.endDate && date > day(reminder.endDate)) continue;
      for (const time of reminder.times) {
        const [h, m] = time.split(':').map(Number) as [number, number];
        const dueAt = zonedInstant(date, h * 60 + m);
        const late = now.getTime() - dueAt.getTime();
        if (late < 0 || late > GRACE_MS) continue;
        try {
          await prisma.reminderDelivery.create({ data: { reminderId: reminder.id, dueAt } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            continue;
          throw error;
        }
        await sendNotification(forHospital(reminder.hospitalId), reminder.hospitalId, {
          to: { userIds: [reminder.patient.userId!] },
          type: 'MEDICATION_REMINDER',
          data: {
            drug: reminder.drugName,
            dose: reminder.dose,
            time,
            reminderId: reminder.id,
            dueAt: dueAt.toISOString(),
          },
          link: '/patient/medications',
        });
        sent += 1;
      }
    }
  }
  return sent;
}

/** Runs the medication (3.26) and visit (3.27) reminders every minute while the server is up. */
export function startReminderScheduler(everyMs = 60_000) {
  const tick = () => {
    runDueReminders().catch((error: unknown) => console.error('Reminders failed', error));
    runAppointmentReminders().catch((error: unknown) =>
      console.error('Appointment reminders failed', error),
    );
  };
  tick();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}

const HOUR = 3_600_000;

/**
 * Reminds patients of their coming visits (task 3.27): the day before, and two
 * hours before. A reminder whose moment was before the visit was booked is
 * skipped (no "tomorrow" right after booking for this afternoon). Each one is
 * marked sent in the same update that claims it, so it goes out once.
 */
export async function runAppointmentReminders(now = new Date()) {
  const visits = await prisma.appointment.findMany({
    where: {
      status: 'BOOKED',
      startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      patient: { userId: { not: null } },
      OR: [{ dayReminderSentAt: null }, { soonReminderSentAt: null }],
    },
    include: { patient: { select: { userId: true } } },
  });
  let sent = 0;
  for (const visit of visits) {
    const until = visit.startsAt.getTime() - now.getTime();
    const kind =
      until <= 2 * HOUR
        ? visit.createdAt.getTime() <= visit.startsAt.getTime() - 2 * HOUR &&
          !visit.soonReminderSentAt
          ? 'SOON'
          : null
        : visit.createdAt.getTime() <= visit.startsAt.getTime() - 24 * HOUR &&
            !visit.dayReminderSentAt
          ? 'DAY'
          : null;
    if (!kind) continue;
    const field = kind === 'DAY' ? 'dayReminderSentAt' : 'soonReminderSentAt';
    const { count } = await prisma.appointment.updateMany({
      where: { id: visit.id, status: 'BOOKED', [field]: null },
      data: { [field]: now },
    });
    if (count === 0) continue;
    await sendNotification(forHospital(visit.hospitalId), visit.hospitalId, {
      to: { userIds: [visit.patient.userId!] },
      type: 'FOLLOW_UP_REMINDER',
      data: {
        doctor: visit.doctorName,
        startsAt: visit.startsAt.toISOString(),
        appointmentId: visit.id,
        kind,
        dueAt: kind,
      },
      link: '/patient/appointments',
    });
    sent += 1;
  }
  return sent;
}
