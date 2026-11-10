import type { DoctorScheduleView, VacationView } from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Palmtree, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Input } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** "1 Dec – 7 Dec 2026" for a vacation's local dates. */
function useRange() {
  const { t, i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' });
  return ({ from, to }: Pick<VacationView, 'from' | 'to'>) =>
    from === to
      ? format.format(new Date(`${from}T00:00:00Z`))
      : t('vacations.range', {
          from: format.format(new Date(`${from}T00:00:00Z`)),
          to: format.format(new Date(`${to}T00:00:00Z`)),
        });
}

function AddVacation({ doctorId }: { doctorId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ schedule: DoctorScheduleView; cancelled: number }>(
          `/staff/${doctorId}/vacations`,
          { from, to: to || from, reason },
          { skipErrorToast: true },
        )
      ).data,
    onSuccess: ({ schedule, cancelled }) => {
      queryClient.setQueryData(queryKeys.doctorSchedule(doctorId), schedule);
      notify.success(
        cancelled ? t('vacations.addedCancelled', { count: cancelled }) : t('vacations.added'),
      );
      setFrom('');
      setTo('');
      setReason('');
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });
  return (
    <form
      noValidate
      className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!from || (to && to < from)) {
          setError(t('vacations.badDates'));
          return playSound('error');
        }
        setError(null);
        add.mutate();
      }}
    >
      <Input
        type="date"
        dir="ltr"
        label={t('vacations.from')}
        value={from}
        onChange={(event) => setFrom(event.target.value)}
      />
      <Input
        type="date"
        dir="ltr"
        label={t('vacations.to')}
        value={to}
        min={from || undefined}
        onChange={(event) => setTo(event.target.value)}
      />
      <Input
        label={t('vacations.reason')}
        maxLength={200}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button type="submit" loading={add.isPending} icon={<Plus className="size-4" />}>
        {t('vacations.add')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-4">
          {error}
        </p>
      )}
      <p className="text-xs text-muted sm:col-span-4">{t('vacations.hint')}</p>
    </form>
  );
}

// A doctor's vacations (task 3.21): the admin adds and removes them (their
// days have no slots and the visits booked then are cancelled, the patients
// told); the doctor sees them.
export function Vacations({
  vacations,
  doctorId,
}: {
  vacations: VacationView[];
  /** Set for the admin, who can add and remove. */
  doctorId?: string;
}) {
  const { t } = useTranslation();
  const range = useRange();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<DoctorScheduleView>(`/staff/${doctorId}/vacations/${id}`)).data,
    onSuccess: (schedule) => {
      queryClient.setQueryData(queryKeys.doctorSchedule(doctorId!), schedule);
      notify.success(t('vacations.removed'));
    },
  });
  return (
    <section aria-label={t('vacations.title')} className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Palmtree className="size-4 text-accent" aria-hidden="true" />
        {t('vacations.title')}
      </h3>
      {vacations.length === 0 ? (
        <p className="text-sm text-muted">{t('vacations.none')}</p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {vacations.map((vacation) => (
              <motion.li
                key={vacation.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={calm}
                aria-label={range(vacation)}
                className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    <bdi>{range(vacation)}</bdi>
                  </span>
                  {vacation.reason && (
                    <span className="block text-xs text-muted">{vacation.reason}</span>
                  )}
                </span>
                {doctorId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
                    aria-label={t('vacations.remove', { range: range(vacation) })}
                    loading={remove.isPending && remove.variables === vacation.id}
                    onClick={() => remove.mutate(vacation.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {doctorId && <AddVacation doctorId={doctorId} />}
    </section>
  );
}
