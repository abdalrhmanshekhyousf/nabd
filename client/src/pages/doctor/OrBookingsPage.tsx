import type { BookingView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, HeartPulse, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { BookingDialog } from '@/components/bookings/BookingDialog';
import { OR_TONE, type OperatingRoom } from '@/components/operatingRooms/orStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Modal, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { addDays, dayKey, dayRange } from '@/lib/day';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

function BookingSlot({ booking }: { booking: BookingView }) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={calm}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border-s-4 px-3 py-2 text-sm',
        booking.mine ? 'border-accent bg-accent-soft/60' : 'border-border bg-surface-muted/70',
      )}
    >
      <Clock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span className="shrink-0 font-medium text-foreground tabular-nums">
        <bdi>{time.format(new Date(booking.startsAt))}</bdi>–
        <bdi>{time.format(new Date(booking.endsAt))}</bdi>
      </span>
      <span className="min-w-0 text-muted">
        {booking.mine
          ? `${t('bookings.mine')} · ${booking.procedure}${booking.patient ? ` · ${patientName(booking.patient, t)}` : ''}`
          : t('bookings.taken', { surgeon: booking.surgeonName })}
      </span>
    </motion.li>
  );
}

// Doctor: the operating rooms schedule, booking a room, and my bookings (task 2.20).
export function OrBookingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(dayKey);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState<BookingView | null>(null);

  const { data: rooms = [], isPending: roomsPending } = useQuery({
    queryKey: queryKeys.operatingRooms,
    queryFn: async () =>
      (await api.get<{ operatingRooms: OperatingRoom[] }>('/operating-rooms')).data.operatingRooms,
  });
  const { data: dayBookings = [] } = useQuery({
    queryKey: queryKeys.bookingsDay(day),
    queryFn: async () =>
      (await api.get<{ bookings: BookingView[] }>('/bookings', { params: dayRange(day) })).data
        .bookings,
  });
  const { data: mine = [] } = useQuery({
    queryKey: queryKeys.myBookings,
    queryFn: async () =>
      (await api.get<{ bookings: BookingView[] }>('/bookings/mine')).data.bookings,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`),
    onSuccess: () => notify.success(t('bookings.cancelled')),
    onSettled: () => {
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
    },
  });

  const dayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(dayRange(day).from));
  const when = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('bookings.title')}</h2>
          <p className="text-sm text-muted">{t('bookings.description')}</p>
        </div>
        <Button icon={<CalendarPlus className="size-4" />} onClick={() => setBooking(true)}>
          {t('bookings.new')}
        </Button>
      </motion.div>

      <motion.section {...enter(1)} aria-label={t('bookings.schedule')} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">{t('bookings.schedule')}</h3>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('bookings.previousDay')}
              onClick={() => setDay((d) => addDays(d, -1))}
            >
              <ChevronRight className="size-4 ltr:rotate-180" />
            </Button>
            <motion.span
              key={day}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-w-32 text-center text-sm font-medium text-foreground"
            >
              {dayLabel}
            </motion.span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('bookings.nextDay')}
              onClick={() => setDay((d) => addDays(d, 1))}
            >
              <ChevronLeft className="size-4 ltr:rotate-180" />
            </Button>
            {day !== dayKey() && (
              <Button size="sm" variant="outline" onClick={() => setDay(dayKey())}>
                {t('bookings.today')}
              </Button>
            )}
          </div>
        </div>
        {roomsPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rooms.map((room) => {
              const slots = dayBookings.filter((b) => b.operatingRoom?.id === room.id);
              return (
                <Card key={room.id} className="space-y-3 p-4" aria-label={room.name}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <HeartPulse className="size-4 text-accent" aria-hidden="true" />
                      {room.name}
                    </p>
                    <StatusBadge tone={OR_TONE[room.status]}>
                      {t(`orStatus.${room.status}`)}
                    </StatusBadge>
                  </div>
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted">{t('bookings.freeAllDay')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      <AnimatePresence initial={false}>
                        {slots.map((slot) => (
                          <BookingSlot key={slot.id} booking={slot} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </motion.section>

      <motion.section {...enter(2)} aria-label={t('bookings.upcoming')} className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('bookings.upcoming')}</h3>
        {mine.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted">
            {t('bookings.noUpcoming')}
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {mine.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {item.procedure}
                    {item.patient ? ` · ${patientName(item.patient, t)}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {item.operatingRoom?.name} · {when.format(new Date(item.startsAt))}
                  </p>
                </div>
                <StatusBadge tone={item.status === 'POSTPONED' ? 'warning' : 'info'}>
                  {t(`bookings.status.${item.status}`)}
                </StatusBadge>
                {(item.status === 'SCHEDULED' || item.status === 'POSTPONED') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
                    aria-label={t('bookings.cancel')}
                    onClick={() => setCancelling(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </motion.section>

      <BookingDialog open={booking} onClose={() => setBooking(false)} day={day} rooms={rooms} />
      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={cancelling ? t('bookings.cancelTitle', { procedure: cancelling.procedure }) : ''}
        description={t('bookings.cancelBody')}
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
              {t('bookings.cancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
