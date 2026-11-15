import { addLocalDays, leaveRequestSchema, zonedDate, type LeaveView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarOff, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { dateRange, REQUEST_TONE } from './requestDisplay';

type Errors = Partial<Record<'from' | 'to' | 'reason' | 'form', string>>;
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function LeaveForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = zonedDate(new Date());
  const [form, setForm] = useState({
    from: addLocalDays(today, 1),
    to: addLocalDays(today, 1),
    reason: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const ask = useMutation({
    mutationFn: async () => api.post('/leave', form, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('leave.sent'));
      setForm((current) => ({ ...current, reason: '' }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.myLeave });
    },
    onError: (failure) => {
      playSound('error');
      setErrors({ form: describeApiError(failure).message });
    },
  });

  return (
    <Card className="p-4 sm:p-5">
      <form
        noValidate
        aria-label={t('leave.new')}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = leaveRequestSchema.safeParse(form);
          if (!parsed.success) {
            const next: Errors = {};
            for (const issue of parsed.error.issues) {
              const key = issue.path[0] as keyof Errors;
              next[key] ??= t(issue.message as 'validation.required');
            }
            setErrors(next);
            playSound('error');
            return;
          }
          setErrors({});
          ask.mutate();
        }}
      >
        <h3 className="font-semibold text-foreground">{t('leave.new')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('leave.from')}
            type="date"
            min={today}
            value={form.from}
            error={errors.from}
            onChange={(event) => {
              const from = event.target.value;
              setForm((current) => ({
                ...current,
                from,
                to: current.to < from ? from : current.to,
              }));
            }}
          />
          <Input
            label={t('leave.to')}
            type="date"
            min={form.from || today}
            value={form.to}
            error={errors.to}
            onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <Textarea
          label={t('leave.reason')}
          rows={2}
          maxLength={300}
          value={form.reason}
          error={errors.reason}
          onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
        />
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          className="w-full sm:w-auto"
          loading={ask.isPending}
          icon={<Send className="size-4" />}
        >
          {t('leave.send')}
        </Button>
      </form>
    </Card>
  );
}

// Leave (task 4.5): every staff member asks for days off and follows what the
// administration decided; a request still pending can be withdrawn.
export function LeavePage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.myLeave,
    queryFn: async () => (await api.get<{ requests: LeaveView[] }>('/leave/mine')).data.requests,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/leave/${id}`),
    onSuccess: () => {
      playSound('toggle');
      notify.success(t('leave.withdrawn'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.myLeave });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('leave.title')}</h2>
        <p className="text-sm text-muted">{t('leave.description')}</p>
      </motion.div>
      <motion.div {...enter(1)}>
        <LeaveForm />
      </motion.div>
      <motion.section {...enter(2)} aria-label={t('leave.mine')} className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('leave.mine')}</h3>
        {!data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : data.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
            <CalendarOff className="size-8 text-muted/60" aria-hidden="true" />
            {t('leave.none')}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {data.map((request) => (
                  <motion.li
                    key={request.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={calm}
                    aria-label={dateRange(request.from, request.to, i18n.language)}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 basis-56 space-y-0.5">
                      <p className="font-semibold text-foreground">
                        <bdi>{dateRange(request.from, request.to, i18n.language)}</bdi>
                        <span className="ms-2 text-xs font-normal text-muted">
                          {t('leave.days', { count: request.days })}
                        </span>
                      </p>
                      <p className="text-sm text-muted">{request.reason}</p>
                      {request.decisionNote && (
                        <p className="text-xs text-foreground">
                          {t('leave.note', { note: request.decisionNote })}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={REQUEST_TONE[request.status]}>
                      {t(`requests.status.${request.status}`)}
                    </StatusBadge>
                    {request.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted hover:bg-danger/10 hover:text-danger"
                        icon={<X className="size-4" />}
                        loading={cancel.isPending && cancel.variables === request.id}
                        onClick={() => cancel.mutate(request.id)}
                      >
                        {t('leave.withdraw')}
                      </Button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        )}
      </motion.section>
    </div>
  );
}
