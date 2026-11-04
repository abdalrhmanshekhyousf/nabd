import {
  ESI_LEVELS,
  isAbnormal,
  isOverdue,
  minutesWaiting,
  VITAL_RANGES,
  type ErVisit,
  type EsiLevel,
  type VitalSign,
} from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock,
  ChevronLeft,
  ClipboardPlus,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ESI_BG } from '@/components/er/esiStyles';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Card, Spinner } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calmSpring, enter } from '@/lib/motion';

const ESI_STRIPE: Record<EsiLevel, string> = {
  1: 'bg-esi-1',
  2: 'bg-esi-2',
  3: 'bg-esi-3',
  4: 'bg-esi-4',
  5: 'bg-esi-5',
};

const SIGNS = Object.keys(VITAL_RANGES) as VitalSign[];

/** Cards move to their new place when a level changes (the report asks for it). */
const cardMotion = {
  layout: true,
  initial: { opacity: 0, y: -12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: 24, transition: { duration: 0.18 } },
  transition: calmSpring,
} as const;

function VisitCard({ visit, now }: { visit: ErVisit; now: number }) {
  const { t } = useTranslation();
  const level = visit.level as EsiLevel | null;
  const name = patientName(visit.patient, t);
  const minutes = minutesWaiting(visit.arrivedAt, now);
  const late = visit.status === 'WAITING' && isOverdue(level, visit.arrivedAt, now);
  const abnormal = SIGNS.filter((sign) => isAbnormal(sign, visit[sign]));

  return (
    <motion.li {...cardMotion}>
      <Link
        to={`../triage/${visit.id}`}
        relative="path"
        aria-label={t('queue.open', { name })}
        className={cn(
          'group relative flex items-stretch gap-3 overflow-hidden rounded-xl border bg-surface shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
          late ? 'border-danger/50' : 'border-border',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('w-1.5 shrink-0', level ? ESI_STRIPE[level] : 'bg-border')}
        />
        <span className="flex min-w-0 flex-1 items-center gap-3 py-3 pe-3">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold',
              level ? ESI_BG[level] : 'bg-surface-muted text-muted',
            )}
          >
            {level ? level : <ClipboardPlus className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-semibold text-foreground">{name}</span>
              {patientFacts(visit.patient, t) && (
                <span className="text-xs text-muted">{patientFacts(visit.patient, t)}</span>
              )}
            </span>
            {visit.chiefComplaint && (
              <span className="block truncate text-sm text-foreground">{visit.chiefComplaint}</span>
            )}
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium',
                  late ? 'bg-danger/12 text-danger' : 'bg-surface-muted text-muted',
                )}
              >
                <AlarmClock className="size-3.5" aria-hidden="true" />
                {minutes === 0 ? t('queue.waitedJustNow') : t('queue.waited', { minutes })}
                {late && ` · ${t('queue.overdue')}`}
              </span>
              {visit.status === 'IN_TREATMENT' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-info/12 px-1.5 py-0.5 font-medium text-info">
                  <Stethoscope className="size-3.5" aria-hidden="true" />
                  {t('queue.inTreatment')}
                </span>
              )}
              {visit.overrideReason && (
                <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-muted">
                  {t('queue.overridden')}
                </span>
              )}
              {abnormal.map((sign) => (
                <span
                  key={sign}
                  className="inline-flex items-center gap-1 rounded-md bg-warning/12 px-1.5 py-0.5 font-medium text-warning"
                >
                  <HeartPulse className="size-3" aria-hidden="true" />
                  {t(`queue.vitals.${sign}`, { value: visit[sign] })}
                </span>
              ))}
            </span>
          </span>
          {level ? (
            <ChevronLeft
              className="size-5 shrink-0 text-muted transition-transform group-hover:text-accent ltr:rotate-180"
              aria-hidden="true"
            />
          ) : (
            <span className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
              {t('queue.assessNow')}
            </span>
          )}
        </span>
      </Link>
    </motion.li>
  );
}

function Group({
  title,
  hint,
  visits,
  now,
}: {
  title: string;
  hint?: string;
  visits: ErVisit[];
  now: number;
}) {
  if (visits.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted">{hint ?? visits.length}</span>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visits.map((visit) => (
            <VisitCard key={visit.id} visit={visit} now={now} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

// ER nurse: the waiting list (task 2.15), by level then arrival, live.
export function ErQueuePage() {
  const { t } = useTranslation();
  const now = useNow();
  const {
    data: visits,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.erQueue,
    queryFn: async () =>
      (await api.get<{ visits: ErVisit[] }>('/er/queue', { skipErrorToast: true })).data.visits,
    retry: false,
  });

  const untriaged = visits?.filter((visit) => visit.level === null) ?? [];
  const triaged = visits?.filter((visit) => visit.level !== null) ?? [];
  const counts = ESI_LEVELS.map((level) => ({
    level,
    count: triaged.filter((v) => v.level === level).length,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('queue.title')}</h2>
          <p className="text-sm text-muted">{t('queue.description')}</p>
        </div>
        <Link
          to="../new-case"
          relative="path"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/88 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
        >
          <UserPlus className="size-4" aria-hidden="true" />
          {t('queue.newCase')}
        </Link>
      </motion.div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-warning/12 text-warning">
            <ShieldAlert className="size-7" aria-hidden="true" />
          </span>
          <p className="font-semibold text-foreground">
            {describeApiError(error).status === 403
              ? t('er.notErTitle')
              : describeApiError(error).message}
          </p>
          {describeApiError(error).status === 403 && (
            <p className="max-w-sm text-sm text-muted">{t('er.notErBody')}</p>
          )}
        </Card>
      ) : (
        <>
          <motion.div
            {...enter(1)}
            className="flex flex-wrap items-center gap-2"
            aria-live="polite"
          >
            <span className="text-sm font-medium text-foreground">
              {t('queue.total', { count: visits.length })}
            </span>
            {counts.map(({ level, count }) => (
              <motion.span
                key={`${level}-${count}`}
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: count ? 1 : 0.4 }}
                transition={calmSpring}
                className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', ESI_BG[level])}
                aria-label={t('queue.levelCount', { level, count })}
              >
                {level} · {count}
              </motion.span>
            ))}
          </motion.div>

          {visits.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-success/12 text-success">
                <HeartPulse className="size-7" aria-hidden="true" />
              </span>
              <p className="font-semibold text-foreground">{t('queue.emptyTitle')}</p>
              <p className="text-sm text-muted">{t('queue.emptyBody')}</p>
            </Card>
          ) : (
            <motion.div {...enter(2)} className="space-y-6">
              <Group
                title={t('queue.toTriage')}
                hint={t('queue.toTriageHint')}
                visits={untriaged}
                now={now}
              />
              <Group title={t('queue.triaged')} visits={triaged} now={now} />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
