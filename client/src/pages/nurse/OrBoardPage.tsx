import type { BookingView, OperatingRoomStatus, OrBoardRoom } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Clock, HeartPulse, Play, ShieldAlert, Siren, Timer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { OR_PULSE, OR_TONE } from '@/components/operatingRooms/orStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Modal, Select, Spinner, StatusBadge } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** The part of the cycle the operating room nurse sees through. */
const STEPS = ['BOOKED', 'PREPARING', 'IN_SURGERY', 'AWAITING_STERILIZATION'] as const;
/** The nurse's next step from each state. */
type Step = 'PREPARING' | 'IN_SURGERY' | 'AWAITING_STERILIZATION';
const NEXT: Partial<Record<OperatingRoomStatus, Step>> = {
  BOOKED: 'PREPARING',
  PREPARING: 'IN_SURGERY',
  IN_SURGERY: 'AWAITING_STERILIZATION',
};

function Stepper({ status }: { status: OperatingRoomStatus }) {
  const { t } = useTranslation();
  const at = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol className="flex items-center gap-1" aria-label={t('orBoard.cycle')}>
      {STEPS.map((step, index) => {
        const done = at > index;
        const current = at === index;
        return (
          <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="relative flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              {(done || current) && (
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={calm}
                  className={cn(
                    'absolute inset-0 origin-left rounded-full rtl:origin-right',
                    current ? 'bg-accent' : 'bg-accent/45',
                  )}
                />
              )}
            </span>
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'truncate text-[11px]',
                current ? 'font-semibold text-foreground' : 'text-muted',
              )}
            >
              {t(`orBoard.steps.${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BookingSummary({ booking, live }: { booking: BookingView; live: boolean }) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const elapsed = booking.startedAt
    ? Math.max(0, Math.floor((now - Date.parse(booking.startedAt)) / 60_000))
    : null;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
        {booking.kind === 'EMERGENCY' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
            <Siren className="size-3" aria-hidden="true" />
            {t('bookings.emergency.label')}
          </span>
        )}
        {booking.procedure}
      </p>
      <p className="text-sm text-muted">
        {booking.patient ? patientName(booking.patient, t) : '—'}
        {booking.surgeonName ? ` · ${t('orBoard.surgeon', { name: booking.surgeonName })}` : ''}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden="true" />
          {t('orBoard.planned')} <bdi>{time.format(new Date(booking.startsAt))}</bdi>–
          <bdi>{time.format(new Date(booking.endsAt))}</bdi>
        </span>
        {live && elapsed !== null && (
          <span className="inline-flex items-center gap-1 font-semibold text-danger">
            <Timer className="size-3.5" aria-hidden="true" />
            {t('orBoard.elapsed', {
              time: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
            })}
          </span>
        )}
      </p>
      {booking.notes && (
        <p className="text-xs whitespace-pre-line text-foreground">{booking.notes}</p>
      )}
    </div>
  );
}

function RoomCard({ room, onEnd }: { room: OrBoardRoom; onEnd: (room: OrBoardRoom) => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState('');
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const next = NEXT[room.status];
  const pick = room.queue.find((b) => b.id === chosen) ?? room.queue[0];
  const shown = room.current ?? (room.status === 'BOOKED' ? pick : undefined);
  const waiting = room.queue.filter((b) => b.id !== shown?.id);

  const step = useMutation({
    mutationFn: (to: Step) =>
      api.post(`/operating-rooms/${room.id}/transition`, {
        to,
        bookingId: to === 'PREPARING' ? (pick?.id ?? null) : null,
      }),
    onSuccess: (_, to) => notify.success(t(`orBoard.done.${to}`, { room: room.name })),
    onError: (error) => {
      notify.error(describeApiError(error).message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  return (
    <Card
      aria-label={room.name}
      className={cn(
        'flex flex-col gap-4 p-4 transition-shadow',
        room.status === 'IN_SURGERY' && 'ring-1 ring-danger/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <HeartPulse
            className={cn(
              'size-4',
              room.status === 'IN_SURGERY' ? 'text-danger' : 'text-accent',
              OR_PULSE.has(room.status) && 'animate-pulse',
            )}
            aria-hidden="true"
          />
          {room.name}
        </p>
        <StatusBadge tone={OR_TONE[room.status]}>{t(`orStatus.${room.status}`)}</StatusBadge>
      </div>
      <Stepper status={room.status} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${room.status}-${shown?.id ?? 'none'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={calm}
          className="min-h-16 flex-1"
        >
          {shown ? (
            <>
              <p className="mb-1 text-xs font-semibold text-muted">
                {room.current ? t('orBoard.now') : t('orBoard.next')}
              </p>
              <BookingSummary booking={shown} live={room.status === 'IN_SURGERY'} />
            </>
          ) : (
            <p className="text-sm text-muted">{t(`orBoard.hint.${room.status}`)}</p>
          )}
        </motion.div>
      </AnimatePresence>

      {room.status === 'BOOKED' && room.queue.length > 1 && (
        <Select
          label={t('orBoard.prepareFor')}
          options={room.queue.map((b) => ({
            value: b.id,
            label: `${time.format(new Date(b.startsAt))} · ${b.procedure ?? ''}`,
          }))}
          value={pick?.id ?? ''}
          onChange={(event) => {
            playSound('toggle');
            setChosen(event.target.value);
          }}
        />
      )}

      {waiting.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">{t('orBoard.waiting')}</p>
          <ul className="space-y-1">
            {waiting.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs text-foreground">
                {b.kind === 'EMERGENCY' && (
                  <Siren className="size-3 text-danger" aria-hidden="true" />
                )}
                <bdi className="font-medium tabular-nums">{time.format(new Date(b.startsAt))}</bdi>
                <span className="min-w-0 truncate text-muted">{b.procedure}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {next && (
        <Button
          className="w-full"
          variant={next === 'AWAITING_STERILIZATION' ? 'success' : 'primary'}
          loading={step.isPending}
          icon={
            next === 'AWAITING_STERILIZATION' ? (
              <CheckCheck className="size-4" />
            ) : (
              <Play className="size-4 rtl:rotate-180" />
            )
          }
          onClick={() => (next === 'AWAITING_STERILIZATION' ? onEnd(room) : step.mutate(next))}
        >
          {t(`orBoard.actions.${next}`)}
        </Button>
      )}
    </Card>
  );
}

// The operating room nurse's board (task 2.22): every room, the operation in
// it and the ones waiting; prepare the room, start the operation, end it.
export function OrBoardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ending, setEnding] = useState<OrBoardRoom | null>(null);
  const board = useQuery({
    queryKey: queryKeys.orBoard,
    queryFn: async () =>
      (await api.get<{ rooms: OrBoardRoom[] }>('/operating-rooms/board', { skipErrorToast: true }))
        .data.rooms,
    retry: false,
  });
  const end = useMutation({
    mutationFn: (room: OrBoardRoom) =>
      api.post(`/operating-rooms/${room.id}/transition`, { to: 'AWAITING_STERILIZATION' }),
    onSuccess: (_, room) =>
      notify.success(t('orBoard.done.AWAITING_STERILIZATION', { room: room.name })),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => {
      setEnding(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  const forbidden = board.isError && describeApiError(board.error).code === 'FORBIDDEN';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('orBoard.title')}</h2>
        <p className="text-sm text-muted">{t('orBoard.description')}</p>
      </motion.div>

      {board.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : forbidden ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <ShieldAlert className="size-8 text-muted" aria-hidden="true" />
          <p className="font-semibold text-foreground">{t('orBoard.notTeam')}</p>
          <p className="text-sm text-muted">{t('orBoard.notTeamHint')}</p>
        </Card>
      ) : board.data?.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">{t('orBoard.noRooms')}</Card>
      ) : (
        <motion.div {...enter(1)} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {board.data?.map((room) => (
            <RoomCard key={room.id} room={room} onEnd={setEnding} />
          ))}
        </motion.div>
      )}

      <Modal
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={
          ending?.current?.procedure
            ? t('orBoard.endTitle', { procedure: ending.current.procedure })
            : t('orBoard.endTitleRoom', { room: ending?.name ?? '' })
        }
        description={t('orBoard.endBody', { room: ending?.name ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnding(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="success"
              loading={end.isPending}
              icon={<CheckCheck className="size-4" />}
              onClick={() => ending && end.mutate(ending)}
            >
              {t('orBoard.actions.AWAITING_STERILIZATION')}
            </Button>
          </>
        }
      />
    </div>
  );
}
