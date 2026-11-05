import {
  BOOKING_DURATIONS,
  emergencyBookingSchema,
  overlaps,
  type BookingView,
  type PatientSummary,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Siren } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { durationLabel } from '@/components/bookings/durationLabel';
import { OR_TONE, type OperatingRoom } from '@/components/operatingRooms/orStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Modal, Select, StatusBadge, Textarea, Input } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** Who the emergency is for: the ER visit open on screen, or one of my patients. */
export type EmergencyTarget = { visitId: string; patientLabel: string } | { mine: true };

type RoomOption = {
  room: OperatingRoom;
  usable: boolean;
  /** Scheduled bookings that would be postponed. */
  postponed: BookingView[];
  /** Why it cannot take the emergency. */
  reason: 'busy' | 'emergency' | null;
};

/** What happens in each room if the emergency starts there now. */
function roomOptions(rooms: OperatingRoom[], bookings: BookingView[], minutes: number) {
  const now = Date.now();
  const slot = {
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + minutes * 60_000).toISOString(),
  };
  return rooms
    .filter((room) => room.status !== 'OUT_OF_SERVICE')
    .map((room): RoomOption => {
      const inTheWay = bookings.filter(
        (b) => b.operatingRoom?.id === room.id && b.status !== 'COMPLETED' && overlaps(b, slot),
      );
      const blocked = inTheWay.some((b) => b.kind === 'EMERGENCY' || b.status === 'IN_PROGRESS');
      const free = room.status === 'AVAILABLE' || room.status === 'BOOKED';
      return {
        room,
        usable: free && !blocked,
        postponed: inTheWay.filter((b) => b.kind === 'SCHEDULED' && b.status === 'SCHEDULED'),
        reason: !free ? 'busy' : blocked ? 'emergency' : null,
      };
    })
    .sort((a, b) => Number(b.usable) - Number(a.usable) || a.postponed.length - b.postponed.length);
}

function EmergencyForm({ target, onDone }: { target: EmergencyTarget; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    patientId: '',
    operatingRoomId: '',
    durationMinutes: 60,
    procedure: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const set = (field: keyof typeof values) => (value: string | number) =>
    setValues((current) => ({ ...current, [field]: value }));

  const { data: rooms = [] } = useQuery({
    queryKey: queryKeys.operatingRooms,
    queryFn: async () =>
      (await api.get<{ operatingRooms: OperatingRoom[] }>('/operating-rooms')).data.operatingRooms,
  });
  // The next twelve hours, enough for the longest operation.
  const { data: bookings = [] } = useQuery({
    queryKey: queryKeys.bookingsAhead,
    queryFn: async () => {
      const from = new Date();
      const to = new Date(from.getTime() + 12 * 3_600_000);
      return (
        await api.get<{ bookings: BookingView[] }>('/bookings', {
          params: { from: from.toISOString(), to: to.toISOString() },
        })
      ).data.bookings;
    },
  });
  const { data: patients = [] } = useQuery({
    queryKey: queryKeys.myPatients(''),
    queryFn: async () =>
      (await api.get<{ patients: PatientSummary[] }>('/doctors/me/patients')).data.patients,
    enabled: 'mine' in target,
  });

  const options = roomOptions(rooms, bookings, values.durationMinutes);
  // Until someone picks, the best room: free, and pushing the fewest bookings back.
  const roomId = values.operatingRoomId || options.find((o) => o.usable)?.room.id || '';
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });

  const save = useMutation({
    mutationFn: async (body: object) =>
      (
        await api.post<{ booking: BookingView; postponed: number }>('/bookings/emergency', body, {
          skipErrorToast: true,
        })
      ).data,
    onSuccess: ({ booking, postponed }) => {
      const room = booking.operatingRoom?.name;
      notify.success(
        t(postponed > 0 ? 'bookings.emergency.bookedPostponed' : 'bookings.emergency.booked', {
          room,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      onDone();
    },
    onError: (error) => {
      const { code, message } = describeApiError(error);
      setErrors({
        [code === 'BOOKING_CONFLICT' || code === 'ROOM_BUSY' || code === 'ROOM_OUT_OF_SERVICE'
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
        const body = {
          operatingRoomId: roomId,
          visitId: 'visitId' in target ? target.visitId : null,
          patientId: 'mine' in target ? values.patientId : null,
          procedure: values.procedure,
          durationMinutes: values.durationMinutes,
          notes: values.notes,
        };
        const parsed = emergencyBookingSchema.safeParse(body);
        if (!parsed.success) {
          const found: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            found[String(issue.path[0])] ??= fieldError(issue.message, t) ?? issue.message;
          }
          setErrors(found);
          return playSound('error');
        }
        save.mutate(body);
      }}
    >
      <p className="flex items-start gap-2 rounded-lg bg-danger/8 p-3 text-sm text-foreground">
        <Siren className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        {t('bookings.emergency.hint')}
      </p>

      {'visitId' in target ? (
        <p className="text-sm">
          <span className="text-muted">{t('bookings.patient')}: </span>
          <span className="font-medium text-foreground">{target.patientLabel}</span>
        </p>
      ) : (
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
      )}

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {t('bookings.room')} <span className="text-danger">*</span>
        </legend>
        <div
          role="radiogroup"
          aria-label={t('bookings.room')}
          className="grid gap-2 sm:grid-cols-2"
        >
          {options.map(({ room, usable, postponed, reason }) => {
            const selected = room.id === roomId;
            return (
              <motion.button
                key={room.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={room.name}
                disabled={!usable}
                whileTap={usable ? { scale: 0.98 } : undefined}
                transition={calm}
                onClick={() => {
                  playSound('toggle');
                  set('operatingRoomId')(room.id);
                }}
                className={cn(
                  'space-y-1.5 rounded-lg border p-3 text-start transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55',
                  selected
                    ? 'border-danger bg-danger/6 ring-1 ring-danger'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{room.name}</span>
                  <StatusBadge tone={OR_TONE[room.status]}>
                    {t(`orStatus.${room.status}`)}
                  </StatusBadge>
                </span>
                <span
                  className={cn(
                    'block text-xs',
                    !usable ? 'text-muted' : postponed.length ? 'text-warning' : 'text-success',
                  )}
                >
                  {reason === 'busy'
                    ? t('bookings.emergency.busy')
                    : reason === 'emergency'
                      ? t('bookings.emergency.taken')
                      : postponed.length
                        ? t('bookings.emergency.willPostpone', {
                            slots: postponed
                              .map(
                                (b) =>
                                  `${time.format(new Date(b.startsAt))}–${time.format(new Date(b.endsAt))}`,
                              )
                              .join('، '),
                          })
                        : t('bookings.emergency.ready')}
                </span>
              </motion.button>
            );
          })}
        </div>
        {errors.operatingRoomId && (
          <p role="alert" className="text-sm text-danger">
            {errors.operatingRoomId}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Input
          label={t('bookings.procedure')}
          placeholder={t('bookings.procedurePlaceholder')}
          required
          value={values.procedure}
          onChange={(event) => set('procedure')(event.target.value)}
          error={errors.procedure}
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
          variant="danger"
          loading={save.isPending}
          disabled={!roomId}
          icon={<Siren className="size-4" />}
        >
          {t('bookings.emergency.book')}
        </Button>
      </div>
    </form>
  );
}

// An operation that cannot wait (task 2.21): it takes a room now, and scheduled
// bookings in its way are postponed with a notice to their doctors.
export function EmergencyBookingDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: EmergencyTarget;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('bookings.emergency.title')} size="lg">
      {open && <EmergencyForm target={target} onDone={onClose} />}
    </Modal>
  );
}
