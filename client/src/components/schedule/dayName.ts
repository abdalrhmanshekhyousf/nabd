import { useTranslation } from 'react-i18next';

/** The weekday's name in the reader's language (2024-01-07 was a Sunday). */
export function useDayName() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' });
  return (weekday: number) => format.format(new Date(Date.UTC(2024, 0, 7 + weekday)));
}
