import {
  minuteToTime,
  VISIT_LENGTHS,
  visitsInDay,
  WEEK_ORDER,
  type DoctorScheduleView,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarCheck, Lock, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { useDayName } from '@/components/schedule/dayName';
import { Vacations } from '@/components/schedule/Vacations';
import { Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

// The doctor's working week (task 3.19): the days and hours the admin set,
// read-only, and the visit length, which is the doctor's own choice. Patients
// book the slots cut from them (3.20–3.22). Live when the admin changes it.
export function SchedulePage() {
  const { t } = useTranslation();
  const dayName = useDayName();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.mySchedule,
    queryFn: async () => (await api.get<DoctorScheduleView>('/doctors/me/schedule')).data,
  });
  const visit = useMutation({
    mutationFn: async (visitMinutes: number) =>
      (await api.put<DoctorScheduleView>('/doctors/me/visit-length', { visitMinutes })).data,
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKeys.mySchedule, fresh);
      notify.success(t('schedule.visitSaved', { count: fresh.visitMinutes }));
    },
  });

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const weekly = data.days.reduce((sum, day) => sum + visitsInDay(day, data.visitMinutes), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('schedule.title')}</h2>
        <p className="text-sm text-muted">{t('schedule.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Timer className="size-4 text-accent" aria-hidden="true" />
            {t('schedule.visitLength')}
          </p>
          <div
            role="radiogroup"
            aria-label={t('schedule.visitLength')}
            className="flex flex-wrap gap-2"
          >
            {VISIT_LENGTHS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                role="radio"
                aria-checked={data.visitMinutes === minutes}
                disabled={visit.isPending}
                onClick={() => {
                  if (minutes === data.visitMinutes) return;
                  playSound('toggle');
                  visit.mutate(minutes);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors disabled:opacity-60',
                  data.visitMinutes === minutes
                    ? 'border-accent bg-accent text-white'
                    : 'border-border text-foreground hover:border-accent',
                )}
              >
                {t('schedule.minutes', { count: minutes })}
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      <motion.section {...enter(2)} aria-label={t('schedule.week')} className="space-y-3">
        <p className="flex items-center gap-2 text-xs text-muted">
          <Lock className="size-3.5" aria-hidden="true" />
          {t('schedule.setByAdmin')}
        </p>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {WEEK_ORDER.map((weekday) => {
              const day = data.days.find((d) => d.weekday === weekday);
              return (
                <motion.li
                  key={weekday}
                  layout
                  transition={calm}
                  aria-label={dayName(weekday)}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3',
                    !day && 'bg-surface-muted/50',
                  )}
                >
                  <span className={cn('font-medium', day ? 'text-foreground' : 'text-muted')}>
                    {dayName(weekday)}
                  </span>
                  {day ? (
                    <span className="flex items-center gap-3 text-sm">
                      <bdi dir="ltr" className="text-foreground tabular-nums">
                        {minuteToTime(day.startMinute)} – {minuteToTime(day.endMinute)}
                      </bdi>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                        {t('schedule.visits', { count: visitsInDay(day, data.visitMinutes) })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted">{t('schedule.dayOff')}</span>
                  )}
                </motion.li>
              );
            })}
          </ul>
        </Card>
        <p className="flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="size-4 text-accent" aria-hidden="true" />
          {data.days.length
            ? t('schedule.weekly', { count: weekly, days: data.days.length })
            : t('schedule.noHours')}
        </p>
      </motion.section>

      <motion.div {...enter(3)}>
        <Card className="p-4">
          <Vacations vacations={data.vacations} />
        </Card>
      </motion.div>
    </div>
  );
}
