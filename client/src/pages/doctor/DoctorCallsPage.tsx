import type { DoctorCallItem, EsiLevel } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FileText, PhoneCall, PhoneOff, Siren } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ESI_BG } from '@/components/er/esiStyles';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import {
  Button,
  Card,
  Modal,
  Spinner,
  StatusBadge,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calmSpring, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { relativeTime } from '@/lib/relativeTime';
import { playSound } from '@/lib/sound';

type Calls = { pending: DoctorCallItem[]; answered: DoctorCallItem[] };

const ANSWER_TONE: Record<DoctorCallItem['status'], StatusTone> = {
  PENDING: 'info',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'neutral',
};

const QUICK_REASONS = ['busy', 'notMine', 'away', 'surgery'] as const;

function useAnswer() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ call, reason }: { call: DoctorCallItem; reason?: string }) =>
      reason === undefined
        ? api.post(`/doctors/me/calls/${call.id}/accept`, undefined, { skipErrorToast: true })
        : api.post(`/doctors/me/calls/${call.id}/decline`, { reason }, { skipErrorToast: true }),
    onSuccess: (_result, { call, reason }) =>
      reason === undefined
        ? notify.success(t('doctorCalls.accepted', { name: patientName(call.visit.patient, t) }))
        : notify.info(t('doctorCalls.declined')),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.doctorCalls }),
        queryClient.invalidateQueries({ queryKey: ['my-patients'] }),
      ]),
  });
}

function LevelBadge({ level, className }: { level: number | null; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-bold',
        level ? ESI_BG[level as EsiLevel] : 'bg-surface-muted text-muted',
        className,
      )}
      aria-label={level ? t('doctorCalls.level', { level }) : t('doctorCalls.notTriaged')}
    >
      {level ?? '?'}
    </span>
  );
}

function DeclineForm({ call, onDone }: { call: DoctorCallItem; onDone: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const answer = useAnswer();
  const missing = !reason.trim();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (missing) return playSound('error');
        answer.mutate({ call, reason: reason.trim() }, { onSuccess: onDone });
      }}
    >
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setReason(t(`doctorCalls.reasons.${key}`))}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
          >
            {t(`doctorCalls.reasons.${key}`)}
          </button>
        ))}
      </div>
      <Textarea
        label={t('doctorCalls.reason')}
        rows={2}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={tried && missing ? t('validation.required') : undefined}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant="danger"
          loading={answer.isPending}
          icon={<PhoneOff className="size-4" />}
        >
          {t('doctorCalls.sendDecline')}
        </Button>
      </div>
    </form>
  );
}

function PendingCall({
  call,
  now,
  onDecline,
}: {
  call: DoctorCallItem;
  now: number;
  onDecline: () => void;
}) {
  const { t, i18n } = useTranslation();
  const answer = useAnswer();
  const { visit } = call;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={calmSpring}
    >
      <Card className="space-y-4 border-danger/30 p-4 shadow-lifted sm:p-5">
        <div className="flex items-start gap-3">
          <LevelBadge level={visit.level} className="size-12 text-xl" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-foreground">
              {patientName(visit.patient, t)}
              <span className="text-xs font-normal text-muted">
                {patientFacts(visit.patient, t)}
              </span>
            </p>
            {visit.chiefComplaint && (
              <p className="text-sm text-foreground">{visit.chiefComplaint}</p>
            )}
            <p className="text-xs text-muted">
              {call.calledBy
                ? t('doctorCalls.calledBy', {
                    name: call.calledBy,
                    when: relativeTime(call.createdAt, i18n.language, now),
                  })
                : t('doctorCalls.calledWhen', {
                    when: relativeTime(call.createdAt, i18n.language, now),
                  })}
            </p>
          </div>
          <Siren
            className="size-5 shrink-0 animate-pulse text-danger motion-reduce:animate-none"
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="sm:flex-1"
            icon={<Check className="size-4" />}
            loading={answer.isPending}
            onClick={() => answer.mutate({ call })}
          >
            {t('doctorCalls.accept')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            icon={<PhoneOff className="size-4" />}
            onClick={onDecline}
          >
            {t('doctorCalls.decline')}
          </Button>
        </div>
      </Card>
    </motion.li>
  );
}

// Doctor: emergency calls, accepted or declined with a reason (task 2.9).
export function DoctorCallsPage() {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [declining, setDeclining] = useState<DoctorCallItem | null>(null);
  const { data, isPending } = useQuery({
    queryKey: queryKeys.doctorCalls,
    queryFn: async () => (await api.get<Calls>('/doctors/me/calls')).data,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('doctorCalls.title')}</h2>
        <p className="text-sm text-muted">{t('doctorCalls.description')}</p>
      </motion.div>

      {isPending || !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.section {...enter(1)} aria-label={t('doctorCalls.pending')} className="space-y-3">
            <h3 className="font-semibold text-foreground">{t('doctorCalls.pending')}</h3>
            {data.pending.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-success/12 text-success">
                  <PhoneCall className="size-7" aria-hidden="true" />
                </span>
                <p className="font-semibold text-foreground">{t('doctorCalls.emptyTitle')}</p>
                <p className="text-sm text-muted">{t('doctorCalls.emptyBody')}</p>
              </Card>
            ) : (
              <ul className="space-y-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {data.pending.map((call) => (
                    <PendingCall
                      key={call.id}
                      call={call}
                      now={now}
                      onDecline={() => setDeclining(call)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.section>

          {data.answered.length > 0 && (
            <motion.section
              {...enter(2)}
              aria-label={t('doctorCalls.answered')}
              className="space-y-3"
            >
              <h3 className="font-semibold text-foreground">{t('doctorCalls.answered')}</h3>
              <Card className="divide-y divide-border">
                {data.answered.map((call) => (
                  <div key={call.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
                    <LevelBadge level={call.visit.level} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {patientName(call.visit.patient, t)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[
                          call.visit.chiefComplaint,
                          call.respondedAt && relativeTime(call.respondedAt, i18n.language, now),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {call.declineReason ? ` · ${call.declineReason}` : ''}
                      </p>
                    </div>
                    <StatusBadge tone={ANSWER_TONE[call.status]}>
                      {t(`doctorCalls.status.${call.status}`)}
                    </StatusBadge>
                    {call.status === 'ACCEPTED' && (
                      <Link
                        to={`../patients/${call.visit.patient.id}`}
                        relative="path"
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <FileText className="size-3.5" aria-hidden="true" />
                        {t('doctorCalls.openFile')}
                      </Link>
                    )}
                  </div>
                ))}
              </Card>
            </motion.section>
          )}
        </>
      )}

      <Modal
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={t('doctorCalls.declineTitle')}
        description={t('doctorCalls.declineHint')}
        size="sm"
      >
        {declining && <DeclineForm call={declining} onDone={() => setDeclining(null)} />}
      </Modal>
    </div>
  );
}
