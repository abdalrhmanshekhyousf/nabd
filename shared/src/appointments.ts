/** Matches the AppointmentStatus enum (tasks 3.19–3.22). */
export const APPOINTMENT_STATUSES = ['BOOKED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Schedules are in the hospital's local time (Syria). */
export const HOSPITAL_TIME_ZONE = 'Asia/Damascus';

/** The week as shown here: Saturday first (0 = Sunday … 6 = Saturday, like Date#getDay). */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

/** Visit lengths a doctor picks from, in minutes. */
export const VISIT_LENGTHS = [10, 15, 20, 30, 45, 60] as const;

/** A doctor's hours on one weekday, in minutes from midnight, set by the admin. */
export type ScheduleDay = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** A doctor's week as the doctor and the admin see it (task 3.19). */
export type DoctorScheduleView = {
  days: ScheduleDay[];
  /** The doctor's own visit length, in minutes. */
  visitMinutes: number;
};

/** How many whole visits fit in a day's hours. */
export const visitsInDay = ({ startMinute, endMinute }: ScheduleDay, visitMinutes: number) =>
  Math.max(0, Math.floor((endMinute - startMinute) / visitMinutes));

/** "08:30" for 510 minutes. */
export const minuteToTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** 510 for "08:30"; NaN when it is not a time. */
export function timeToMinute(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.NaN;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return Number.NaN;
  return hours * 60 + minutes;
}
