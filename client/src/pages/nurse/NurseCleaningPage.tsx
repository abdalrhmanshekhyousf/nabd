import { createCleaningRequestSchema, type CleaningRequestView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, ShieldAlert, SprayCan, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Modal, Spinner, StatusBadge, Textarea } from '@/components/ui';
import type { StatusTone } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cleaningNote, cleaningPlace } from '@/lib/cleaningText';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

const QUICK_PLACES = ['corridor', 'waiting', 'toilets', 'station'] as const;

const TONE: Record<CleaningRequestView['status'], StatusTone> = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  DONE: 'success',
  CANCELLED: 'neutral',
};

function RequestForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ place: '', note: '' });
  const [errors, setErrors] = useState<{ place?: string; note?: string }>({});
  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ request: CleaningRequestView }>('/cleaning-requests', values, {
          skipErrorToast: true,
        })
      ).data.request,
    onSuccess: (request) => {
      notify.success(t('nurseCleaning.sent', { place: request.place }));
      setValues({ place: '', note: '' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.departmentCleaning });
    },
    onError: (error) => {
      setErrors({ place: describeApiError(error).message });
      playSound('error');
    },
  });

  return (
    <Card className="p-4 sm:p-5">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = createCleaningRequestSchema.safeParse(values);
          if (!parsed.success) {
            const found: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
              found[String(issue.path[0])] ??= fieldError(issue.message, t) ?? issue.message;
            }
            setErrors(found);
            return playSound('error');
          }
          setErrors({});
          send.mutate();
        }}
      >
        <div className="space-y-2">
          <Input
            label={t('nurseCleaning.place')}
            placeholder={t('nurseCleaning.placePlaceholder')}
            required
            value={values.place}
            onChange={(event) => setValues((v) => ({ ...v, place: event.target.value }))}
            error={errors.place}
          />
          <div className="flex flex-wrap gap-1.5" aria-label={t('nurseCleaning.quick')}>
            {QUICK_PLACES.map((key) => {
              const label = t(`nurseCleaning.quickPlaces.${key}`);
              const chosen = values.place === label;
              return (
                <motion.button
                  key={key}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={chosen}
                  onClick={() => {
                    playSound('tap');
                    setValues((v) => ({ ...v, place: label }));
                    setErrors((e) => ({ ...e, place: undefined }));
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                    chosen
                      ? 'border-accent bg-accent-soft text-foreground'
                      : 'border-border bg-surface text-muted hover:text-foreground',
                  )}
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
        </div>
        <Textarea
          label={t('nurseCleaning.note')}
          placeholder={t('nurseCleaning.notePlaceholder')}
          rows={2}
          value={values.note}
          onChange={(event) => setValues((v) => ({ ...v, note: event.target.value }))}
          error={errors.note}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            loading={send.isPending}
            icon={<Send className="size-4 rtl:-scale-x-100" />}
          >
            {t('nurseCleaning.send')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Any nurse asks the cleaners of their department to clean a place (task
// 2.25), and follows how the department's requests are going.
export function NurseCleaningPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState<CleaningRequestView | null>(null);
  const list = useQuery({
    queryKey: queryKeys.departmentCleaning,
    queryFn: async () =>
      (
        await api.get<{ requests: CleaningRequestView[] }>('/cleaning-requests/department', {
          skipErrorToast: true,
        })
      ).data.requests,
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/cleaning-requests/${id}`, { skipErrorToast: true }),
    onSuccess: () => notify.success(t('nurseCleaning.cancelled')),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => {
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.departmentCleaning });
    },
  });
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const noDepartment = list.isError && describeApiError(list.error).code === 'FORBIDDEN';

  const statusText = (r: CleaningRequestView) =>
    r.status === 'IN_PROGRESS'
      ? t('nurseCleaning.status.IN_PROGRESS', { name: r.assignedTo?.fullName ?? '—' })
      : r.status === 'DONE'
        ? t('nurseCleaning.status.DONE', {
            time: r.finishedAt ? time.format(new Date(r.finishedAt)) : '',
          })
        : t(`nurseCleaning.status.${r.status}`);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('nurseCleaning.title')}</h2>
        <p className="text-sm text-muted">{t('nurseCleaning.description')}</p>
      </motion.div>

      {noDepartment ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <ShieldAlert className="size-8 text-muted" aria-hidden="true" />
          <p className="font-semibold text-foreground">{t('nurseCleaning.noDepartment')}</p>
          <p className="text-sm text-muted">{t('nurseCleaning.noDepartmentHint')}</p>
        </Card>
      ) : (
        <>
          <motion.div {...enter(1)}>
            <RequestForm />
          </motion.div>
          <motion.section {...enter(2)} aria-label={t('nurseCleaning.list')} className="space-y-3">
            <h3 className="font-semibold text-foreground">{t('nurseCleaning.list')}</h3>
            {list.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : list.data?.length ? (
              <Card className="overflow-hidden">
                <ul>
                  <AnimatePresence initial={false}>
                    {list.data.map((r) => (
                      <motion.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={calm}
                        aria-label={cleaningPlace(r, t) ?? ''}
                        className={cn(
                          'flex flex-wrap items-center gap-3 border-b border-border p-3 last:border-b-0 sm:px-4',
                          r.status === 'CANCELLED' && 'opacity-60',
                        )}
                      >
                        <SprayCan className="size-4 shrink-0 text-accent" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{cleaningPlace(r, t)}</p>
                          {r.note && (
                            <p className="text-sm text-foreground/80">{cleaningNote(r, t)}</p>
                          )}
                          <p className="text-xs text-muted">
                            {r.mine
                              ? t('nurseCleaning.mine')
                              : t('nurseCleaning.by', { name: r.requestedBy ?? '—' })}{' '}
                            · <bdi>{time.format(new Date(r.createdAt))}</bdi>
                          </p>
                        </div>
                        <StatusBadge tone={TONE[r.status]}>{statusText(r)}</StatusBadge>
                        {r.mine && r.status === 'PENDING' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
                            aria-label={t('nurseCleaning.cancel')}
                            onClick={() => setCancelling(r)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            ) : (
              <Card className="px-6 py-8 text-center text-sm text-muted">
                {t('nurseCleaning.empty')}
              </Card>
            )}
          </motion.section>
        </>
      )}

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={t('nurseCleaning.cancelTitle', {
          place: (cancelling && cleaningPlace(cancelling, t)) ?? '',
        })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancelling && cancel.mutate(cancelling.id)}
            >
              {t('nurseCleaning.cancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
