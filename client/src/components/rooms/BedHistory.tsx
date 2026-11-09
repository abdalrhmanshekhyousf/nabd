import type { BedStatusChangeView } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { calm } from '@/lib/motion';
import { BED_TONE } from './bedStyles';

// A bed's history of states (task 3.15), newest first: from → to, who, when,
// and the patient of the stay. Shown to the admin and, from 3.16, to nurses.
export function BedHistory({ bedId }: { bedId: string }) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const { data: history } = useQuery({
    queryKey: queryKeys.bedHistory(bedId),
    queryFn: async () =>
      (await api.get<{ history: BedStatusChangeView[] }>(`/beds/${bedId}/history`)).data.history,
  });
  return (
    <section aria-label={t('beds.history')} className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <History className="size-4 text-accent" aria-hidden="true" />
        {t('beds.history')}
      </h4>
      {!history ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted">{t('beds.noHistory')}</p>
      ) : (
        <ol className="max-h-72 space-y-2 overflow-y-auto">
          {history.map((change, index) => (
            <motion.li
              key={change.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...calm, delay: Math.min(index, 8) * 0.03 }}
              className="space-y-1 rounded-lg border border-border px-3 py-2"
            >
              <p className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={BED_TONE[change.fromStatus]} dot={false}>
                  {t(`bedStatus.${change.fromStatus}`)}
                </StatusBadge>
                <ArrowLeft className="size-3.5 text-muted ltr:rotate-180" aria-hidden="true" />
                <StatusBadge tone={BED_TONE[change.toStatus]} dot={false}>
                  {t(`bedStatus.${change.toStatus}`)}
                </StatusBadge>
              </p>
              <p className="text-xs text-muted">
                {change.changedByName} · <bdi>{when.format(new Date(change.createdAt))}</bdi>
                {change.patientName && ` · ${change.patientName}`}
              </p>
              {change.reason && <p className="text-xs text-foreground">{change.reason}</p>}
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  );
}
