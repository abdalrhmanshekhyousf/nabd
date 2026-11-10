import {
  minuteToTime,
  timeToMinute,
  visitsInDay,
  WEEK_ORDER,
  type ScheduleDay,
} from '@nabd/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Copy, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Switch } from '@/components/ui';
import { controlClasses } from '@/components/ui/controlClasses';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { playSound } from '@/lib/sound';
import { useDayName } from './dayName';

/** A day being edited: on or off, with its hours as typed. */
type Draft = { on: boolean; from: string; to: string };

const DEFAULT: Draft = { on: false, from: '09:00', to: '14:00' };

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
function check(weekday: number, draft: Draft, visitMinutes: number) {
  const startMinute = timeToMinute(draft.from);
  const endMinute = timeToMinute(draft.to);
  if (Number.isNaN(startMinute) || Number.isNaN(endMinute) || startMinute % 5 || endMinute % 5) {
    return { error: 'schedule.badTime' as const };
  }
  if (endMinute <= startMinute) return { error: 'schedule.endAfterStart' as const };
  if (endMinute - startMinute < visitMinutes) return { error: 'schedule.tooShort' as const };
  return { day: { weekday, startMinute, endMinute } };
}

const same = (a: ScheduleDay[], b: ScheduleDay[]) =>
  JSON.stringify([...a].sort((x, y) => x.weekday - y.weekday)) ===
  JSON.stringify(
    [...b]
      .sort((x, y) => x.weekday - y.weekday)
      .map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
  );

// The admin sets a doctor's week (task 3.19): days on or off from Saturday,
// their hours (or one day's hours copied to all), with how many visits of the
// doctor's length each day and the week will hold.
export function WeekEditor({
  saved,
  visitMinutes,
  saving,
  onSave,
}: {
  saved: ScheduleDay[];
  visitMinutes: number;
  saving: boolean;
  onSave: (days: ScheduleDay[]) => void;
}) {
  const { t } = useTranslation();
  const dayName = useDayName();
  const [drafts, setDrafts] = useState(() => toDrafts(saved));
  const set = (weekday: number, change: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [weekday]: { ...current[weekday]!, ...change } }));

  const checked = WEEK_ORDER.map((weekday) => ({
    weekday,
    draft: drafts[weekday]!,
    result: check(weekday, drafts[weekday]!, visitMinutes),
  }));
  const days = checked.flatMap(({ draft, result }) => (draft.on && result.day ? [result.day] : []));
  const invalid = checked.some(({ draft, result }) => draft.on && result.error);
  const weekly = days.reduce((sum, day) => sum + visitsInDay(day, visitMinutes), 0);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return playSound('error');
        onSave(days);
      }}
    >
      <ul aria-label={t('schedule.week')} className="space-y-2">
        {checked.map(({ weekday, draft, result }) => {
          const name = dayName(weekday);
          return (
            <li key={weekday}>
              <Card
                aria-label={name}
                className={cn(
                  'space-y-3 p-3 transition-colors',
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
                        ? t('schedule.visits', { count: visitsInDay(result.day, visitMinutes) })
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
      </ul>

      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="size-4 text-accent" aria-hidden="true" />
          {t('schedule.weekly', { count: weekly, days: days.length })}
        </p>
        <Button
          type="submit"
          loading={saving}
          disabled={same(days, saved) || invalid}
          icon={<Save className="size-4" />}
        >
          {t('schedule.save')}
        </Button>
      </div>
    </form>
  );
}
