import { HOSPITAL_TIME_ZONE } from '@nabd/shared';

/** Times and days as the hospital lives them (task 3.22), whatever the device's zone. */
export function hospitalFormat(language: string) {
  const time = new Intl.DateTimeFormat(language, {
    timeStyle: 'short',
    timeZone: HOSPITAL_TIME_ZONE,
  });
  const full = new Intl.DateTimeFormat(language, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: HOSPITAL_TIME_ZONE,
  });
  // Local dates ("2026-11-14") are read at noon UTC so no zone moves them a day.
  const day = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  return {
    time: (iso: string) => time.format(new Date(iso)),
    full: (iso: string) => full.format(new Date(iso)),
    weekday: (date: string) => day(date, { weekday: 'short' }),
    dayNumber: (date: string) => day(date, { day: 'numeric' }),
    month: (date: string) => day(date, { month: 'short' }),
    longDay: (date: string) => day(date, { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}
