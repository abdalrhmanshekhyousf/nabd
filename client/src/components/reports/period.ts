import { useTranslation } from 'react-i18next';

/** "1 Nov 2026 to 7 Nov 2026" for a report period whose end is exclusive. */
export function usePeriodLabel() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  return (from: string | Date, to: string | Date) =>
    t('reports.range', {
      from: date.format(new Date(from)),
      to: date.format(new Date(new Date(to).getTime() - 1)),
    });
}
