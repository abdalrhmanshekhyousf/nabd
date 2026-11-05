import type { TFunction } from 'i18next';

/** "30 دقيقة", "ساعة ونص", "3 ساعات" for an operation's length. */
export function durationLabel(minutes: number, t: TFunction) {
  if (minutes < 60) return t('bookings.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return minutes % 60
    ? t('bookings.hoursHalf', { count: hours })
    : t('bookings.hours', { count: hours });
}
