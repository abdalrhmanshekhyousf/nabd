import {
  addLocalDays,
  suggestTimes,
  zonedDate,
  type MedicationReminderView,
  type MyMedication,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellOff,
  BellRing,
  Clock,
  Pause,
  Pill,
  Play,
  Plus,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Spinner, StatusBadge } from '@/components/ui';
import { controlClasses } from '@/components/ui/controlClasses';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { playSound } from '@/lib/sound';

type Mine = { medications: MyMedication[]; reminders: MedicationReminderView[] };

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.myMedications });
}

/** Device notifications on this browser: so reminders arrive with the site closed. */
function PushCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (!state) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === 'on' ? await disablePush() : await enablePush();
      setState(next);
      if (next === 'on') notify.success(t('medications.push.enabled'));
      if (next === 'denied') playSound('error');
    } catch (error) {
      notify.error(describeApiError(error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          state === 'on' ? 'bg-success/12 text-success' : 'bg-surface-muted text-muted',
        )}
      >
        <Smartphone className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold text-foreground">{t('medications.push.title')}</p>
        <p className="text-sm text-muted">{t(`medications.push.${state}`)}</p>
      </div>
      {(state === 'on' || state === 'off') && (
        <Button
          variant={state === 'on' ? 'outline' : 'primary'}
          loading={busy}
          icon={state === 'on' ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
          onClick={() => void toggle()}
        >
          {state === 'on' ? t('medications.push.turnOff') : t('medications.push.turnOn')}
        </Button>
      )}
    </Card>
  );
}

/** Editing a reminder's daily times, one to six. */
function Times({ times, onChange }: { times: string[]; onChange: (times: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{t('medications.times')}</p>
      <ul className="flex flex-wrap gap-2">
        {times.map((time, index) => (
          <li key={index} className="flex items-center gap-1">
            <input
              type="time"
              step={300}
              dir="ltr"
              aria-label={t('medications.time', { n: index + 1 })}
              className={cn(controlClasses, 'h-10 w-28 px-2 tabular-nums')}
              value={time}
              onChange={(event) =>
                onChange(times.map((v, i) => (i === index ? event.target.value : v)))
              }
            />
            {times.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted hover:text-danger"
                aria-label={t('medications.removeTime', { time })}
                onClick={() => onChange(times.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            )}
          </li>
        ))}
        {times.length < 6 && (
          <li>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus className="size-4" />}
              onClick={() => onChange([...times, '12:00'])}
            >
              {t('medications.addTime')}
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** Setting a reminder for a medicine (prescribed, or one of my own). */
function ReminderForm({ medication, onDone }: { medication?: MyMedication; onDone: () => void }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const today = zonedDate(new Date());
  const [drugName, setDrugName] = useState(medication?.drugName ?? '');
  const [dose, setDose] = useState(medication?.dose ?? '');
  const [times, setTimes] = useState(() =>
    medication ? suggestTimes(medication.frequency) : ['08:00'],
  );
  const [error, setError] = useState<string | null>(null);
  const days = medication?.durationDays ?? null;
  const save = useMutation({
    mutationFn: () =>
      api.post(
        '/patients/me/reminders',
        {
          prescriptionItemId: medication?.prescriptionItemId ?? null,
          drugName,
          dose,
          times,
          startDate: today,
          endDate: days ? addLocalDays(today, days - 1) : null,
        },
        { skipErrorToast: true },
      ),
    onSuccess: () => {
      notify.success(t('medications.saved', { drug: drugName }));
      void refresh();
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });
  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={calm}
      noValidate
      className="space-y-3 overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        if (!drugName.trim() || !dose.trim() || times.some((v) => !v)) {
          setError(t('medications.fillIn'));
          return playSound('error');
        }
        save.mutate();
      }}
    >
      {!medication && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            label={t('medications.drug')}
            value={drugName}
            onChange={(e) => setDrugName(e.target.value)}
          />
          <Input
            label={t('medications.dose')}
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </div>
      )}
      <Times times={times} onChange={setTimes} />
      <p className="text-xs text-muted">
        {days ? t('medications.forDays', { count: days }) : t('medications.noEnd')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} icon={<BellRing className="size-4" />}>
          {t('medications.save')}
        </Button>
      </div>
    </motion.form>
  );
}

/** A set reminder: its times, pause or resume, and remove. */
function ReminderLine({ reminder }: { reminder: MedicationReminderView }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const toggle = useMutation({
    mutationFn: () =>
      api.patch(`/patients/me/reminders/${reminder.id}`, { active: !reminder.active }),
    onSuccess: () => {
      notify.success(reminder.active ? t('medications.paused') : t('medications.resumed'));
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/patients/me/reminders/${reminder.id}`),
    onSuccess: () => {
      notify.success(t('medications.removed'));
      void refresh();
    },
  });
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg px-3 py-2',
        reminder.active ? 'bg-accent-soft/60' : 'bg-surface-muted',
      )}
    >
      <Clock
        className={cn('size-4', reminder.active ? 'text-accent' : 'text-muted')}
        aria-hidden="true"
      />
      <ul aria-label={t('medications.times')} className="flex flex-1 flex-wrap gap-1.5">
        {reminder.times.map((time) => (
          <li
            key={time}
            dir="ltr"
            className="rounded-md bg-surface px-2 py-0.5 text-sm font-medium text-foreground tabular-nums"
          >
            {time}
          </li>
        ))}
      </ul>
      {!reminder.active && <StatusBadge tone="neutral">{t('medications.pausedBadge')}</StatusBadge>}
      <Button
        size="icon"
        variant="ghost"
        className="size-9"
        aria-label={reminder.active ? t('medications.pause') : t('medications.resume')}
        loading={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {reminder.active ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
        aria-label={t('medications.remove')}
        loading={remove.isPending}
        onClick={() => remove.mutate()}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function MedicationCard({ medication }: { medication: MyMedication }) {
  const { t, i18n } = useTranslation();
  const [setting, setSetting] = useState(false);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  return (
    <motion.li layout transition={calm}>
      <Card aria-label={medication.drugName} className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Pill className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">
              {medication.drugName} · {medication.dose}
            </p>
            <p className="text-sm text-muted">
              {medication.frequency}
              {medication.durationDays
                ? ` · ${t('patients.days', { count: medication.durationDays })}`
                : ''}
              {medication.instructions ? ` · ${medication.instructions}` : ''}
            </p>
            <p className="text-xs text-muted">
              {medication.doctorName} · <bdi>{date.format(new Date(medication.prescribedAt))}</bdi>
            </p>
          </div>
        </div>
        {medication.reminder ? (
          <ReminderLine reminder={medication.reminder} />
        ) : (
          <AnimatePresence initial={false} mode="wait">
            {setting ? (
              <ReminderForm key="form" medication={medication} onDone={() => setSetting(false)} />
            ) : (
              <Button
                key="button"
                variant="outline"
                className="w-full sm:w-auto"
                icon={<BellRing className="size-4" />}
                onClick={() => setSetting(true)}
              >
                {t('medications.remind')}
              </Button>
            )}
          </AnimatePresence>
        )}
      </Card>
    </motion.li>
  );
}

// The patient's medicines (task 3.26): each prescribed medicine with a
// reminder at the times they choose (suggested from the prescription), their
// own extra reminders, and device notifications so reminders arrive even with
// the site closed.
export function MedicationsPage() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({
    queryKey: queryKeys.myMedications,
    queryFn: async () => (await api.get<Mine>('/patients/me/medications')).data,
  });
  const own = data?.reminders.filter((r) => !r.prescriptionItemId) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('medications.title')}</h2>
        <p className="text-sm text-muted">{t('medications.description')}</p>
      </motion.div>
      <motion.div {...enter(1)}>
        <PushCard />
      </motion.div>
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.section
            {...enter(2)}
            aria-label={t('medications.prescribed')}
            className="space-y-3"
          >
            <h3 className="font-semibold text-foreground">{t('medications.prescribed')}</h3>
            {data.medications.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-muted">
                {t('medications.none')}
              </Card>
            ) : (
              <ul className="space-y-3">
                {data.medications.map((medication) => (
                  <MedicationCard key={medication.prescriptionItemId} medication={medication} />
                ))}
              </ul>
            )}
          </motion.section>
          <motion.section {...enter(3)} aria-label={t('medications.own')} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">{t('medications.own')}</h3>
              {!adding && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus className="size-4" />}
                  onClick={() => setAdding(true)}
                >
                  {t('medications.addOwn')}
                </Button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {adding && (
                <Card key="add" className="p-4">
                  <ReminderForm onDone={() => setAdding(false)} />
                </Card>
              )}
            </AnimatePresence>
            {own.length === 0 && !adding ? (
              <p className="text-sm text-muted">{t('medications.noOwn')}</p>
            ) : (
              <ul className="space-y-2">
                {own.map((reminder) => (
                  <li key={reminder.id} aria-label={reminder.drugName} className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {reminder.drugName} · {reminder.dose}
                    </p>
                    <ReminderLine reminder={reminder} />
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        </>
      )}
    </div>
  );
}
