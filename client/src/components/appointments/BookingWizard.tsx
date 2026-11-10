import type {
  AppointmentView,
  BookableDepartment,
  BookableDoctor,
  DaySlots,
  Slot,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarCheck,
  CalendarX,
  Check,
  Clock,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { DepartmentIcon } from '@/components/departments/DepartmentIcon';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Spinner, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { hospitalFormat } from '@/lib/hospitalTime';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

export type BookingStart = {
  department: Pick<BookableDepartment, 'id' | 'name' | 'code'>;
  doctor: { id: string; fullName: string };
} | null;

type Step = 'department' | 'doctor' | 'slot' | 'done';

const STEPS = ['department', 'doctor', 'slot'] as const;

function Steps({ step }: { step: Step }) {
  const { t } = useTranslation();
  const at = step === 'done' ? STEPS.length : STEPS.indexOf(step as (typeof STEPS)[number]);
  return (
    <ol aria-label={t('booking.steps')} className="flex items-center gap-2">
      {STEPS.map((name, index) => (
        <li
          key={name}
          className="flex flex-1 items-center gap-2"
          aria-current={index === at ? 'step' : undefined}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300',
              index < at
                ? 'bg-success text-success-foreground'
                : index === at
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-muted',
            )}
          >
            {index < at ? <Check className="size-4" aria-hidden="true" /> : index + 1}
          </span>
          <span
            className={cn(
              'hidden text-xs sm:inline',
              index === at ? 'font-semibold text-foreground' : 'text-muted',
            )}
          >
            {t(`booking.step.${name}`)}
          </span>
          {index < STEPS.length - 1 && (
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
    >
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
      {label}
    </button>
  );
}

function Departments({ onPick }: { onPick: (d: BookableDepartment) => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.bookingDepartments,
    queryFn: async () =>
      (await api.get<{ departments: BookableDepartment[] }>('/appointments/departments')).data
        .departments,
  });
  if (!data) return <Spinner />;
  if (data.length === 0) return <p className="text-sm text-muted">{t('booking.noDepartments')}</p>;
  return (
    <ul aria-label={t('booking.step.department')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {data.map((department) => (
        <li key={department.id}>
          <button
            type="button"
            onClick={() => {
              playSound('tap');
              onPick(department);
            }}
            className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3 text-start transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-accent hover:shadow-lifted"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <DepartmentIcon code={department.code} className="size-5" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              {departmentLabel(department, t)}
            </span>
            <span className="text-xs text-muted">
              {t('booking.doctors', { count: department.doctorCount })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Doctors({
  departmentId,
  onPick,
}: {
  departmentId: string;
  onPick: (d: BookableDoctor) => void;
}) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const { data } = useQuery({
    queryKey: queryKeys.bookingDoctors(departmentId),
    queryFn: async () =>
      (
        await api.get<{ doctors: BookableDoctor[] }>('/appointments/doctors', {
          params: { departmentId },
        })
      ).data.doctors,
  });
  if (!data) return <Spinner />;
  return (
    <ul aria-label={t('booking.step.doctor')} className="space-y-2">
      {data.map((doctor) => (
        <li key={doctor.id}>
          <button
            type="button"
            disabled={!doctor.nextSlot}
            onClick={() => {
              playSound('tap');
              onPick(doctor);
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">{doctor.fullName}</span>
              <span className="block text-xs text-muted">
                {doctor.specialty} · {t('booking.visit', { count: doctor.visitMinutes })}
              </span>
            </span>
            <span className="shrink-0 text-end text-xs">
              {doctor.nextSlot ? (
                <>
                  <span className="block text-muted">{t('booking.nextSlot')}</span>
                  <bdi className="block font-medium text-success">
                    {format.full(doctor.nextSlot)}
                  </bdi>
                </>
              ) : (
                <span className="text-muted">{t('booking.fullyBooked')}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Slots({
  doctor,
  onBooked,
}: {
  doctor: { id: string; fullName: string };
  onBooked: (appointment: AppointmentView) => void;
}) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const { data: days } = useQuery({
    queryKey: queryKeys.slots(doctor.id),
    queryFn: async () =>
      (
        await api.get<{ days: DaySlots[] }>('/appointments/slots', {
          params: { doctorId: doctor.id, days: 31 },
        })
      ).data.days,
  });
  const book = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ appointment: AppointmentView }>(
          '/appointments',
          { doctorId: doctor.id, startsAt: slot!.startsAt, reason },
          { skipErrorToast: true },
        )
      ).data.appointment,
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myAppointments });
      onBooked(appointment);
    },
    onError: (failure) => {
      notify.error(describeApiError(failure).message);
      playSound('error');
      setSlot(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.slots(doctor.id) });
    },
  });

  if (!days) return <Spinner />;
  if (days.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <CalendarX className="size-4" aria-hidden="true" />
        {t('booking.noSlots')}
      </p>
    );
  }
  const chosenDay = days.find((d) => d.date === date) ?? days[0]!;
  // A slot taken by someone else meanwhile disappears from the list.
  const stillFree = slot && chosenDay.slots.some((s) => s.startsAt === slot.startsAt);

  return (
    <div className="space-y-4">
      <ul aria-label={t('booking.days')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const selected = day.date === chosenDay.date;
          return (
            <li key={day.date}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={format.longDay(day.date)}
                onClick={() => {
                  playSound('toggle');
                  setDate(day.date);
                  setSlot(null);
                }}
                className={cn(
                  'flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition-colors',
                  selected
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface hover:border-accent',
                )}
              >
                <span className={cn('text-xs', selected ? 'text-white/85' : 'text-muted')}>
                  {format.weekday(day.date)}
                </span>
                <span className="text-lg font-bold tabular-nums">{format.dayNumber(day.date)}</span>
                <span className={cn('text-[0.65rem]', selected ? 'text-white/85' : 'text-muted')}>
                  {format.month(day.date)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <section
        aria-label={t('booking.times', { day: format.longDay(chosenDay.date) })}
        className="space-y-2"
      >
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Clock className="size-4 text-accent" aria-hidden="true" />
          {t('booking.times', { day: format.longDay(chosenDay.date) })}
        </p>
        <div
          role="radiogroup"
          aria-label={t('booking.time')}
          className="grid grid-cols-3 gap-2 sm:grid-cols-5"
        >
          <AnimatePresence initial={false}>
            {chosenDay.slots.map((s) => {
              const chosen = slot?.startsAt === s.startsAt;
              return (
                <motion.button
                  key={s.startsAt}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={calm}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => {
                    playSound('tap');
                    setSlot(s);
                  }}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-sm tabular-nums transition-colors',
                    chosen
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-border hover:border-accent',
                  )}
                >
                  <bdi>{format.time(s.startsAt)}</bdi>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
      <AnimatePresence>
        {slot && stillFree && (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={calm}
            noValidate
            className="space-y-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              book.mutate();
            }}
          >
            <p className="text-sm text-foreground">
              {t('booking.summary', { doctor: doctor.fullName })} ·{' '}
              <bdi className="font-semibold">{format.full(slot.startsAt)}</bdi>
            </p>
            <Textarea
              label={t('booking.reason')}
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              type="submit"
              className="w-full"
              loading={book.isPending}
              icon={<CalendarCheck className="size-4" />}
            >
              {t('booking.confirm')}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// Booking a visit (task 3.22): department, then doctor (with their first free
// slot), then a day and a time in hospital time; a slot someone else takes
// meanwhile disappears live. Can start at a doctor (booking again after a
// cancelled visit).
export function BookingWizard({ start, onClose }: { start: BookingStart; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const [step, setStep] = useState<Step>(start ? 'slot' : 'department');
  const [department, setDepartment] = useState(start?.department ?? null);
  const [doctor, setDoctor] = useState<{ id: string; fullName: string } | null>(
    start?.doctor ?? null,
  );
  const [booked, setBooked] = useState<AppointmentView | null>(null);

  const body = (() => {
    if (step === 'done' && booked) {
      return (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="flex size-14 items-center justify-center rounded-full bg-success text-success-foreground"
          >
            <Check className="size-7" aria-hidden="true" />
          </motion.span>
          <p className="text-lg font-bold text-foreground">{t('booking.booked')}</p>
          <p className="text-sm text-muted">
            {booked.doctorName} · <bdi>{format.full(booked.startsAt)}</bdi>
          </p>
          <Button onClick={onClose}>{t('booking.toMyVisits')}</Button>
        </div>
      );
    }
    if (step === 'slot' && doctor) {
      return (
        <div className="space-y-4">
          <Back
            label={t('booking.otherDoctor')}
            onClick={() => setStep(department ? 'doctor' : 'department')}
          />
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Stethoscope className="size-4 text-accent" aria-hidden="true" />
            {doctor.fullName}
            {department && (
              <span className="text-sm font-normal text-muted">
                · {departmentLabel(department, t)}
              </span>
            )}
          </p>
          <Slots
            doctor={doctor}
            onBooked={(appointment) => {
              playSound('success');
              setBooked(appointment);
              setStep('done');
            }}
          />
        </div>
      );
    }
    if (step === 'doctor' && department) {
      return (
        <div className="space-y-4">
          <Back label={t('booking.otherDepartment')} onClick={() => setStep('department')} />
          <p className="font-semibold text-foreground">{departmentLabel(department, t)}</p>
          <Doctors
            departmentId={department.id}
            onPick={(d) => {
              setDoctor(d);
              setStep('slot');
            }}
          />
        </div>
      );
    }
    return (
      <Departments
        onPick={(d) => {
          setDepartment(d);
          setStep('doctor');
        }}
      />
    );
  })();

  return (
    <Card aria-label={t('booking.title')} className="space-y-5 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">{t('booking.title')}</h3>
        {step !== 'done' && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
      <Steps step={step} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={calm}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}
