import type { ReportView } from '@nabd/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { usePeriodLabel } from './period';

// Sent reports as rows; the admin sees who sent each and a dot on the unread.
export function ReportList({
  reports,
  onOpen,
  forAdmin,
}: {
  reports: ReportView[];
  onOpen: (report: ReportView) => void;
  forAdmin: boolean;
}) {
  const { t, i18n } = useTranslation();
  const period = usePeriodLabel();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      <AnimatePresence initial={false}>
        {reports.map((report) => {
          const unread = !report.readAt;
          return (
            <motion.li
              key={report.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={calm}
            >
              <button
                type="button"
                onClick={() => onOpen(report)}
                aria-label={`${t(`reports.kinds.${report.kind}`)} · ${period(report.periodFrom, report.periodTo)}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    forAdmin && unread ? 'bg-accent' : 'bg-transparent',
                  )}
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span
                    className={cn(
                      'block text-sm break-words text-foreground',
                      forAdmin && unread && 'font-semibold',
                    )}
                  >
                    {forAdmin
                      ? t('reports.from', {
                          kind: t(`reports.kinds.${report.kind}`),
                          author: report.authorName,
                        })
                      : period(report.periodFrom, report.periodTo)}
                  </span>
                  <span className="block text-xs text-muted">
                    {forAdmin && <>{period(report.periodFrom, report.periodTo)} · </>}
                    <bdi>
                      {t('reports.sentAt', { date: when.format(new Date(report.createdAt)) })}
                    </bdi>
                  </span>
                </span>
                {forAdmin ? (
                  unread && <StatusBadge tone="info">{t('reports.new')}</StatusBadge>
                ) : (
                  <StatusBadge tone={unread ? 'neutral' : 'success'}>
                    {unread ? t('reports.unread') : t('reports.read')}
                  </StatusBadge>
                )}
                <ChevronLeft
                  className="size-4 shrink-0 text-muted ltr:rotate-180"
                  aria-hidden="true"
                />
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
