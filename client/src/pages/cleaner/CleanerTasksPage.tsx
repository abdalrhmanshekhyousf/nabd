import type { CleaningRequestView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Clock, Play, ShieldPlus, Sparkles, SprayCan, Timer, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Spinner, StatusBadge } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

/** "1:05" for an hour and five minutes since `iso`. */
const since = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

function JobCard({ job, action }: { job: CleaningRequestView; action?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const sterile = job.kind === 'STERILIZATION';
  const working = job.status === 'IN_PROGRESS';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={calm}
    >
      <Card
        aria-label={job.place ?? t(`cleaning.kind.${job.kind}`)}
        className={cn(
          'flex h-full flex-col gap-3 border-s-4 p-4',
          sterile ? 'border-s-danger' : 'border-s-accent',
          job.mine && working && 'ring-1 ring-accent',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              {sterile ? (
                <ShieldPlus className="size-4 shrink-0 text-danger" aria-hidden="true" />
              ) : (
                <SprayCan className="size-4 shrink-0 text-accent" aria-hidden="true" />
              )}
              <span className="truncate">{job.place ?? '—'}</span>
            </p>
            <p className="text-xs text-muted">{departmentLabel(job.department, t)}</p>
          </div>
          <StatusBadge tone={sterile ? 'danger' : 'info'}>
            {t(`cleaning.kind.${job.kind}`)}
          </StatusBadge>
        </div>
        {job.note && <p className="text-sm whitespace-pre-line text-foreground">{job.note}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {t('cleaning.requestedAt', { time: time.format(new Date(job.createdAt)) })}
          </span>
          {job.requestedBy && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5" aria-hidden="true" />
              {t('cleaning.requestedBy', { name: job.requestedBy })}
            </span>
          )}
          {job.status === 'PENDING' && (
            <span className={cn('font-medium', sterile && 'text-danger')}>
              {t('cleaning.waiting', { time: since(job.createdAt, now) })}
            </span>
          )}
          {working && job.startedAt && (
            <span className="inline-flex items-center gap-1 font-semibold text-accent">
              <Timer className="size-3.5" aria-hidden="true" />
              {job.mine
                ? t('cleaning.workingMine', { time: since(job.startedAt, now) })
                : t('cleaning.workingOther', { name: job.assignedTo?.fullName ?? '—' })}
            </span>
          )}
          {job.status === 'DONE' && job.finishedAt && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCheck className="size-3.5" aria-hidden="true" />
              {t('cleaning.finishedAt', { time: time.format(new Date(job.finishedAt)) })}
            </span>
          )}
        </p>
        {action}
      </Card>
    </motion.li>
  );
}

function Section({
  title,
  jobs,
  children,
}: {
  title: string;
  jobs: CleaningRequestView[];
  children: (job: CleaningRequestView) => ReactNode;
}) {
  if (jobs.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-surface-muted px-2 text-xs text-muted tabular-nums">
          {jobs.length}
        </span>
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>{jobs.map(children)}</AnimatePresence>
      </ul>
    </section>
  );
}

// The cleaner's board (task 2.24): jobs of the departments they cover,
// sterilizations first; "started" takes one, "finished" closes it.
export function CleanerTasksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: jobs = [], isPending } = useQuery({
    queryKey: queryKeys.cleaningRequests,
    queryFn: async () =>
      (await api.get<{ requests: CleaningRequestView[] }>('/cleaning-requests')).data.requests,
  });
  const move = useMutation({
    mutationFn: async ({ job, step }: { job: CleaningRequestView; step: 'start' | 'finish' }) =>
      (
        await api.post<{ request: CleaningRequestView }>(
          `/cleaning-requests/${job.id}/${step}`,
          undefined,
          { skipErrorToast: true },
        )
      ).data.request,
    onSuccess: (done, { step }) =>
      notify.success(
        t(step === 'start' ? 'cleaning.started' : 'cleaning.finished', {
          place: done.place ?? '',
        }),
      ),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cleaningRequests });
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
    },
  });
  const busy = (job: CleaningRequestView) => move.isPending && move.variables?.job.id === job.id;

  const mine = jobs.filter((j) => j.status === 'IN_PROGRESS' && j.mine);
  const waiting = jobs.filter((j) => j.status === 'PENDING');
  const others = jobs.filter((j) => j.status === 'IN_PROGRESS' && !j.mine);
  const done = jobs.filter((j) => j.status === 'DONE');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('cleaning.title')}</h2>
        <p className="text-sm text-muted">{t('cleaning.description')}</p>
      </motion.div>

      {isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : mine.length + waiting.length + others.length === 0 ? (
        <motion.div {...enter(1)}>
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Sparkles className="size-8 text-success" aria-hidden="true" />
            <p className="font-semibold text-foreground">{t('cleaning.allClear')}</p>
            <p className="text-sm text-muted">{t('cleaning.allClearHint')}</p>
          </Card>
        </motion.div>
      ) : null}

      <motion.div {...enter(1)} className="space-y-6">
        <Section title={t('cleaning.mine')} jobs={mine}>
          {(job) => (
            <JobCard
              key={job.id}
              job={job}
              action={
                <Button
                  variant="success"
                  className="mt-auto w-full"
                  loading={busy(job)}
                  icon={<CheckCheck className="size-4" />}
                  onClick={() => move.mutate({ job, step: 'finish' })}
                >
                  {t('cleaning.finish')}
                </Button>
              }
            />
          )}
        </Section>
        <Section title={t('cleaning.waitingTitle')} jobs={waiting}>
          {(job) => (
            <JobCard
              key={job.id}
              job={job}
              action={
                <Button
                  className="mt-auto w-full"
                  variant={job.kind === 'STERILIZATION' ? 'danger' : 'primary'}
                  loading={busy(job)}
                  icon={<Play className="size-4 rtl:rotate-180" />}
                  onClick={() => move.mutate({ job, step: 'start' })}
                >
                  {t('cleaning.start')}
                </Button>
              }
            />
          )}
        </Section>
        <Section title={t('cleaning.others')} jobs={others}>
          {(job) => <JobCard key={job.id} job={job} />}
        </Section>
        <Section title={t('cleaning.doneToday')} jobs={done}>
          {(job) => <JobCard key={job.id} job={job} />}
        </Section>
      </motion.div>
    </div>
  );
}
