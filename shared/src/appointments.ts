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

/** How far ahead patients can book (task 3.20). */
export const BOOKING_DAYS_AHEAD = 30;

/** A bookable slot (task 3.20). Times are ISO instants. */
export type Slot = { startsAt: string; endsAt: string };

/** One local day of a doctor's free slots. */
export type DaySlots = { date: string; weekday: number; slots: Slot[] };

/** Minutes the zone is ahead of UTC at this instant (e.g. 180 for Damascus). */
export function zoneOffset(at: Date, timeZone = HOSPITAL_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant of a local wall-clock time ("2026-11-14" at 510 minutes) in the zone. */
export function zonedInstant(date: string, minute: number, timeZone = HOSPITAL_TIME_ZONE) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  // Correct by the zone's offset at that moment (twice, across a change of offset).
  let instant = guess - zoneOffset(new Date(guess), timeZone) * 60_000;
  instant = guess - zoneOffset(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** The local date ("YYYY-MM-DD") of an instant in the zone. */
export function zonedDate(at: Date, timeZone = HOSPITAL_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** A local date moved by whole days. */
export function addLocalDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Sunday = 0 … Saturday = 6 for a local date. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * Every slot of a doctor's week over `days` local days from `from` (task 3.20):
 * each working day cut into visits of the doctor's length, whole visits only.
 */
export function cutSlots(
  schedule: ScheduleDay[],
  visitMinutes: number,
  from: string,
  days: number,
  timeZone = HOSPITAL_TIME_ZONE,
) {
  const result: DaySlots[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addLocalDays(from, i);
    const weekday = weekdayOf(date);
    const day = schedule.find((d) => d.weekday === weekday);
    if (!day) continue;
    const slots: Slot[] = [];
    for (
      let start = day.startMinute;
      start + visitMinutes <= day.endMinute;
      start += visitMinutes
    ) {
      slots.push({
        startsAt: zonedInstant(date, start, timeZone).toISOString(),
        endsAt: zonedInstant(date, start + visitMinutes, timeZone).toISOString(),
      });
    }
    result.push({ date, weekday, slots });
  }
  return result;
}
