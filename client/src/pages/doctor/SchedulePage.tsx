import {
  minuteToTime,
  timeToMinute,
  VISIT_LENGTHS,
  visitsInDay,
  WEEK_ORDER,
  type ScheduleDay,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Copy, Save, Timer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Spinner, Switch } from '@/components/ui';
import { controlClasses } from '@/components/ui/controlClasses';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** A day being edited: on or off, with its hours as typed. */
type Draft = { on: boolean; from: string; to: string };

const DEFAULT: Draft = { on: false, from: '09:00', to: '14:00' };

/** The weekday's name in the reader's language (2024-01-07 was a Sunday). */
function useDayName() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' });
  return (weekday: number) => format.format(new Date(Date.UTC(2024, 0, 7 + weekday)));
}

function toDrafts(days: ScheduleDay[]) {
  return Object.fromEntries(
    WEEK_ORDER.map((weekday) => {
      const day = days.find((d) => d.weekday === weekday);
      return [
        weekday,
        day
          ? { on: true, from: minuteToTime(day.startMinute), to: minuteToTime(day.endMinute) }
          : DEFAULT,
      ];
    }),
  ) as Record<number, Draft>;
}

/** The day as the server wants it, or why it can't be. */
function check(weekday: number, draft: Draft, slotMinutes: number) {
  const startMinute = timeToMinute(draft.from);
  const endMinute = timeToMinute(draft.to);
  if (Number.isNaN(startMinute) || Number.isNaN(endMinute) || startMinute % 5 || endMinute % 5) {
    return { error: 'schedule.badTime' as const };
  }
  if (endMinute <= startMinute) return { error: 'schedule.endAfterStart' as const };
  if (endMinute - startMinute < slotMinutes) return { error: 'schedule.tooShort' as const };
  return { day: { weekday, startMinute, endMinute, slotMinutes } };
}

function Editor({ saved }: { saved: ScheduleDay[] }) {
  const { t } = useTranslation();
  const dayName = useDayName();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState(() => toDrafts(saved));
  const [slot, setSlot] = useState<number>(saved[0]?.slotMinutes ?? 20);
  const set = (weekday: number, change: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [weekday]: { ...current[weekday]!, ...change } }));

  const checked = WEEK_ORDER.map((weekday) => ({
    weekday,
    draft: drafts[weekday]!,
    result: check(weekday, drafts[weekday]!, slot),
  }));
  const days = checked.flatMap(({ draft, result }) => (draft.on && result.day ? [result.day] : []));
  const invalid = checked.some(({ draft, result }) => draft.on && result.error);
  const weekly = days.reduce((sum, day) => sum + visitsInDay(day), 0);
  const unchanged =
    JSON.stringify(days) ===
    JSON.stringify(
      WEEK_ORDER.flatMap((w) => saved.filter((d) => d.weekday === w)).map((d) => ({
        weekday: d.weekday,
        startMinute: d.startMinute,
        endMinute: d.endMinute,
        slotMinutes: d.slotMinutes,
      })),
    );

  const save = useMutation({
    mutationFn: async () =>
      (await api.put<{ days: ScheduleDay[] }>('/doctors/me/schedule', { days })).data.days,
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKeys.mySchedule, fresh);
      notify.success(t('schedule.saved'));
    },
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return playSound('error');
        save.mutate();
      }}
    >
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
                aria-checked={slot === minutes}
                onClick={() => {
                  playSound('toggle');
                  setSlot(minutes);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors',
                  slot === minutes
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

      <motion.ul {...enter(2)} aria-label={t('schedule.week')} className="space-y-2">
        {checked.map(({ weekday, draft, result }) => {
          const name = dayName(weekday);
          const visits = result.day ? visitsInDay(result.day) : 0;
          return (
            <li key={weekday}>
              <Card
                aria-label={name}
                className={cn(
                  'space-y-3 p-4 transition-colors',
                  !draft.on && 'bg-surface-muted/60',
                )}
              >
                <Switch
                  checked={draft.on}
                  onChange={(on) => set(weekday, { on })}
                  label={name}
                  description={
                    draft.on
                      ? result.day
                        ? t('schedule.visits', { count: visits })
                        : t(result.error!)
                      : t('schedule.dayOff')
                  }
                />
                <AnimatePresence initial={false}>
                  {draft.on && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={calm}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-end gap-3 pt-1">
                        {(['from', 'to'] as const).map((edge) => (
                          <label key={edge} className="space-y-1 text-xs text-muted">
                            <span className="block">{t(`schedule.${edge}`)}</span>
                            <input
                              type="time"
                              step={300}
                              dir="ltr"
                              aria-label={`${name} · ${t(`schedule.${edge}`)}`}
                              aria-invalid={result.error ? true : undefined}
                              className={cn(controlClasses, 'h-10 w-32 px-3 tabular-nums')}
                              value={draft[edge]}
                              onChange={(event) => set(weekday, { [edge]: event.target.value })}
                            />
                          </label>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Copy className="size-4" />}
                          disabled={!result.day}
                          onClick={() =>
                            setDrafts((current) =>
                              Object.fromEntries(
                                Object.entries(current).map(([w, d]) => [
                                  w,
                                  d.on ? { ...d, from: draft.from, to: draft.to } : d,
                                ]),
                              ),
                            )
                          }
                        >
                          {t('schedule.copyToAll')}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </li>
          );
        })}
      </motion.ul>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="size-4 text-accent" aria-hidden="true" />
          {t('schedule.weekly', { count: weekly, days: days.length })}
        </p>
        <Button
          type="submit"
          loading={save.isPending}
          disabled={unchanged || invalid}
          icon={<Save className="size-4" />}
        >
          {t('schedule.save')}
        </Button>
      </div>
    </form>
  );
}

// The doctor's working week (task 3.19): which days, from when to when, and
// how long a visit is. Patients book in the slots cut from it (3.20–3.22).
export function SchedulePage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.mySchedule,
    queryFn: async () => (await api.get<{ days: ScheduleDay[] }>('/doctors/me/schedule')).data.days,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('schedule.title')}</h2>
        <p className="text-sm text-muted">{t('schedule.description')}</p>
      </motion.div>
      {data ? (
        <Editor saved={data} />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
    </div>
  );
}
