import type { ConsultationStatus, ConsultationView } from '@nabd/shared';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, MessageSquareReply } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { StatusBadge, type StatusTone } from '@/components/ui';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';

const CONSULTATION_TONE: Record<ConsultationStatus, StatusTone> = {
  PENDING: 'warning',
  ANSWERED: 'success',
  CANCELLED: 'neutral',
};

// One consultation (task 3.12): who asked whom, the question, its state and,
// once answered (3.14), the reply. `showPatient` on the doctors' page.
export function ConsultationCard({
  consultation,
  showPatient = false,
  highlight = false,
  action,
}: {
  consultation: ConsultationView;
  showPatient?: boolean;
  highlight?: boolean;
  action?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={calm}
      data-consultation={consultation.id}
      aria-label={
        showPatient
          ? patientName(consultation.patient, t)
          : t('consultations.between', {
              from: consultation.requesterName,
              to: consultation.consultantName,
            })
      }
      className={cn(
        'space-y-2 px-4 py-3 transition-colors',
        consultation.status === 'CANCELLED' && 'opacity-60',
        highlight && 'bg-accent-soft',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-52 space-y-0.5">
          {showPatient && (
            <p className="font-semibold text-foreground">
              {patientName(consultation.patient, t)}
              <span className="ms-2 text-xs font-normal text-muted">
                {patientFacts(consultation.patient, t)}
              </span>
            </p>
          )}
          <p className="text-sm text-foreground">
            {t('consultations.fromTo', {
              from: consultation.requesterName,
              to: consultation.consultantName,
            })}
          </p>
          <p className="text-xs text-muted">
            <bdi>{when.format(new Date(consultation.createdAt))}</bdi>
          </p>
        </div>
        <StatusBadge tone={CONSULTATION_TONE[consultation.status]}>
          {t(`consultations.status.${consultation.status}`)}
        </StatusBadge>
        {action}
      </div>
      <p className="flex gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="whitespace-pre-line">{consultation.question}</span>
      </p>
      {consultation.reply && (
        <p className="flex gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
          <MessageSquareReply className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="whitespace-pre-line">{consultation.reply}</span>
        </p>
      )}
    </motion.li>
  );
}
