/** A local calendar day as YYYY-MM-DD (not UTC: a booking at 1 am is "today"). */
export function dayKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight to midnight of a local day, as ISO times for the API. */
export function dayRange(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  const from = new Date(year, month - 1, day);
  const to = new Date(year, month - 1, day + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function addDays(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day + days));
}

/** A local day and "HH:MM" as an ISO time. */
export function atTime(key: string, time: string) {
  const [year, month, day] = key.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}
