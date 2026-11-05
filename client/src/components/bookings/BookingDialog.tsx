import {
  BOOKING_DURATIONS,
  createBookingSchema,
  overlaps,
  type BookingView,
  type PatientSummary,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Clock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import type { OperatingRoom } from '@/components/operatingRooms/orStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { atTime, dayKey, dayRange } from '@/lib/day';
import { fieldError } from '@/lib/fieldError';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function durationLabel(minutes: number, t: TFunction) {
  if (minutes < 60) return t('bookings.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return minutes % 60
    ? t('bookings.hoursHalf', { count: hours })
    : t('bookings.hours', { count: hours });
}

function BookingForm({
  initialDay,
  rooms,
  onDone,
}: {
  initialDay: string;
  rooms: OperatingRoom[];
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    patientId: '',
    operatingRoomId: '',
    day: initialDay,
    time: '09:00',
    durationMinutes: 60,
    procedure: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const set = (field: keyof typeof values) => (value: string | number) =>
    setValues((current) => ({ ...current, [field]: value }));

  const { data: patients = [] } = useQuery({
    queryKey: queryKeys.myPatients(''),
    queryFn: async () =>
      (await api.get<{ patients: PatientSummary[] }>('/doctors/me/patients')).data.patients,
  });
  // The chosen day's bookings, to warn about a clash before saving.
  const { data: dayBookings = [] } = useQuery({
    queryKey: queryKeys.bookingsDay(values.day),
    queryFn: async () =>
      (await api.get<{ bookings: BookingView[] }>('/bookings', { params: dayRange(values.day) }))
        .data.bookings,
    enabled: Boolean(values.day),
  });

  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const startsAt = values.day && values.time ? atTime(values.day, values.time) : null;
  const slot = startsAt && {
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + values.durationMinutes * 60_000).toISOString(),
  };
  const roomBookings = dayBookings.filter(
    (booking) =>
      booking.operatingRoom?.id === values.operatingRoomId && booking.status !== 'COMPLETED',
  );
  const clash = slot ? roomBookings.find((booking) => overlaps(booking, slot)) : undefined;
  const room = rooms.find((candidate) => candidate.id === values.operatingRoomId);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ booking: BookingView }>(
          '/bookings',
          {
            operatingRoomId: values.operatingRoomId,
            patientId: values.patientId,
            procedure: values.procedure,
            startsAt,
            durationMinutes: values.durationMinutes,
            notes: values.notes,
          },
          { skipErrorToast: true },
        )
      ).data.booking,
    onSuccess: (booking) => {
      notify.success(
        t('bookings.booked', {
          room: booking.operatingRoom?.name,
          when: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(booking.startsAt)),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      onDone();
    },
    onError: (error) => {
      const { code, message } = describeApiError(error);
      setErrors({
        [code === 'BOOKING_CONFLICT'
          ? 'time'
          : code === 'ROOM_OUT_OF_SERVICE'
            ? 'operatingRoomId'
            : 'procedure']: message,
      });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = createBookingSchema.safeParse({ ...values, startsAt: startsAt ?? '' });
        if (!parsed.success) {
          const found: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const field = issue.path[0] === 'startsAt' ? 'time' : String(issue.path[0]);
            found[field] ??= fieldError(issue.message, t) ?? issue.message;
          }
          setErrors(found);
          return playSound('error');
        }
        if (clash) return playSound('error');
        save.mutate();
      }}
    >
      {patients.length === 0 && (
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
          {t('bookings.noPatients')}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t('bookings.patient')}
          placeholder={t('bookings.choosePatient')}
          required
          options={patients.map((patient) => ({
            value: patient.patientId,
            label: patientName(patient, t),
          }))}
          value={values.patientId}
          onChange={(event) => set('patientId')(event.target.value)}
          error={errors.patientId}
        />
        <Select
          label={t('bookings.room')}
          placeholder={t('bookings.chooseRoom')}
          required
          options={rooms
            .filter((candidate) => candidate.status !== 'OUT_OF_SERVICE')
            .map((candidate) => ({ value: candidate.id, label: candidate.name }))}
          value={values.operatingRoomId}
          onChange={(event) => set('operatingRoomId')(event.target.value)}
          error={errors.operatingRoomId}
        />
        <Input
          label={t('bookings.date')}
          type="date"
          min={dayKey()}
          dir="ltr"
          required
          value={values.day}
          onChange={(event) => set('day')(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('bookings.time')}
            type="time"
            step={900}
            dir="ltr"
            required
            value={values.time}
            onChange={(event) => set('time')(event.target.value)}
            error={errors.time}
          />
          <Select
            label={t('bookings.duration')}
            options={BOOKING_DURATIONS.map((minutes) => ({
              value: String(minutes),
              label: durationLabel(minutes, t),
            }))}
            value={String(values.durationMinutes)}
            onChange={(event) => set('durationMinutes')(Number(event.target.value))}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {room && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={calm}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-lg bg-surface-muted/70 p-3 text-sm">
              <p className="text-xs font-semibold text-muted">
                {t('bookings.roomDay', { room: room.name })}
              </p>
              {roomBookings.length === 0 ? (
                <p className="text-muted">{t('bookings.roomFree')}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {roomBookings.map((booking) => (
                    <li
                      key={booking.id}
                      className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-xs text-foreground shadow-soft"
                    >
                      <Clock className="size-3" aria-hidden="true" />
                      <span>
                        <bdi>{time.format(new Date(booking.startsAt))}</bdi>–
                        <bdi>{time.format(new Date(booking.endsAt))}</bdi>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {clash && (
                <p role="alert" className="flex items-start gap-1.5 font-medium text-danger">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t('bookings.clash', {
                    from: time.format(new Date(clash.startsAt)),
                    to: time.format(new Date(clash.endsAt)),
                  })}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Input
        label={t('bookings.procedure')}
        placeholder={t('bookings.procedurePlaceholder')}
        required
        value={values.procedure}
        onChange={(event) => set('procedure')(event.target.value)}
        error={errors.procedure}
      />
      <Textarea
        label={t('bookings.notes')}
        rows={2}
        value={values.notes}
        onChange={(event) => set('notes')(event.target.value)}
      />

      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          loading={save.isPending}
          disabled={Boolean(clash)}
          icon={<CalendarCheck className="size-4" />}
        >
          {t('bookings.book')}
        </Button>
      </div>
    </form>
  );
}

// A doctor books an operating room for one of their patients (task 2.20).
export function BookingDialog({
  open,
  onClose,
  day,
  rooms,
}: {
  open: boolean;
  onClose: () => void;
  day: string;
  rooms: OperatingRoom[];
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('bookings.dialog')} size="lg">
      {open && <BookingForm initialDay={day} rooms={rooms} onDone={onClose} />}
    </Modal>
  );
}
