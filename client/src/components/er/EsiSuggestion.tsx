import type { EsiLevel, EsiReason } from '@nabd/shared';
import { AnimatePresence, motion } from 'framer-motion';
import type { TFunction } from 'i18next';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { calm, calmSpring } from '@/lib/motion';
import { ESI_BG, ESI_BORDER } from './esiStyles';

function reasonText(reason: EsiReason, t: TFunction) {
  switch (reason.code) {
    case 'ABNORMAL_VITALS':
      return t('triage.reason.ABNORMAL_VITALS', {
        signs: reason.signs.map((sign) => t(`triage.${sign}`)).join('، '),
      });
    case 'SEVERE_PAIN':
      return t('triage.reason.SEVERE_PAIN', { score: reason.score });
    case 'EXAMS':
      return t(`triage.reason.EXAMS_${reason.count as 0 | 1 | 2}`);
    default:
      return t(`triage.reason.${reason.code}`);
  }
}

// The suggested ESI level and why (task 2.13), live while the form is filled.
export function EsiSuggestion({
  level,
  reasons,
  savedLevel,
}: {
  level: EsiLevel;
  reasons: EsiReason[];
  savedLevel: number | null;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('triage.suggested')}
      aria-live="polite"
      className={cn(
        'flex items-start gap-4 rounded-xl border-2 bg-surface p-4 transition-colors duration-300',
        ESI_BORDER[level],
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={level}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={calmSpring}
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold shadow-soft',
            ESI_BG[level],
          )}
          aria-hidden="true"
        >
          {level}
        </motion.span>
      </AnimatePresence>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t('triage.suggested')}
        </p>
        <motion.p
          key={level}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={calm}
          className="font-bold text-foreground"
        >
          {t('triage.level', { level })} · {t(`triage.esi.L${level}`)}
          <span className="block text-sm font-normal text-muted">
            {t(`triage.esiMeaning.L${level}`)}
          </span>
        </motion.p>
        <ul className="flex flex-wrap gap-1.5">
          {reasons.length === 0 ? (
            <li className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
              {t('triage.reason.incomplete')}
            </li>
          ) : (
            reasons.map((reason) => (
              <li
                key={reason.code}
                className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground"
              >
                {reasonText(reason, t)}
              </li>
            ))
          )}
        </ul>
        {savedLevel !== null && (
          <p className="text-xs text-muted">{t('triage.savedLevel', { level: savedLevel })}</p>
        )}
      </div>
    </section>
  );
}
