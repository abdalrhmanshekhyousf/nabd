const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "now", "5 minutes ago", "yesterday"… in the given language; older than a
 * week becomes a plain date.
 */
export function relativeTime(iso: string, language: string, now = Date.now()) {
  const date = new Date(iso);
  const seconds = Math.round((date.getTime() - now) / 1000);
  const ago = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });

  if (ago < 45) return format.format(0, 'second');
  if (ago < HOUR) return format.format(Math.round(seconds / MINUTE), 'minute');
  if (ago < DAY) return format.format(Math.round(seconds / HOUR), 'hour');
  if (ago < WEEK) return format.format(Math.round(seconds / DAY), 'day');
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}
