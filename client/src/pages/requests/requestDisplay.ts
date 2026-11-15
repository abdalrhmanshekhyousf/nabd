import type { RequestStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';

export const REQUEST_TONE: Record<RequestStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

/** "15 Nov – 17 Nov" in the user's language, for local dates. */
export function dateRange(from: string, to: string, language: string) {
  const format = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const a = format.format(new Date(`${from}T00:00:00Z`));
  return from === to ? a : `${a} – ${format.format(new Date(`${to}T00:00:00Z`))}`;
}
