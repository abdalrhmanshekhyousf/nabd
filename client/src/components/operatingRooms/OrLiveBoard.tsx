import type { OperatingRoomStatus, OrBoardRoom } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, HeartPulse, Power, ShieldPlus, Siren, Timer, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { OR_PULSE, OR_TONE } from '@/components/operatingRooms/orStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Modal, Spinner, StatusBadge } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { useSessionStore } from '@/stores/sessionStore';

/** The order the summary counts the rooms in. */
const ORDER: OperatingRoomStatus[] = [
  'IN_SURGERY',
  'PREPARING',
  'BOOKED',
  'AWAITING_STERILIZATION',
  'STERILIZING',
  'AVAILABLE',
  'OUT_OF_SERVICE',
];

/** A coloured strip on top of each tile, from the status tone. */
const STRIP: Record<string, string> = {
  success: 'bg-success',
  info: 'bg-info',
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-muted/50',
};

const clock = (fromIso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

function RoomTile({
  room,
  isAdmin,
  onService,
}: {
  room: OrBoardRoom;
  isAdmin: boolean;
  onService: (room: OrBoardRoom) => void;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const tone = OR_TONE[room.status];
  const booking = room.current ?? room.queue[0] ?? null;
  const inRoom = room.current !== null;

  return (
    <motion.li layout transition={calm}>
      <Card
        aria-label={room.name}
        className="relative flex h-full flex-col gap-3 overflow-hidden p-4"
      >
        <span className={cn('absolute inset-x-0 top-0 h-1', STRIP[tone])} aria-hidden="true" />
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
          <StatusBadge tone={tone}>{t(`orStatus.${room.status}`)}</StatusBadge>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" aria-hidden="true" />
          {t('orLive.since', { time: clock(room.statusChangedAt, now) })}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${room.status}-${booking?.id ?? ''}-${room.sterilization?.status ?? ''}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={calm}
            className="flex-1 space-y-1 text-sm"
          >
            {room.status === 'AWAITING_STERILIZATION' || room.status === 'STERILIZING' ? (
              <p className="flex items-center gap-1.5 text-foreground">
                <ShieldPlus className="size-4 text-warning" aria-hidden="true" />
                {room.sterilization?.by
                  ? t('orLive.sterilizingBy', { name: room.sterilization.by })
                  : t('orLive.awaitingTeam')}
              </p>
            ) : room.status === 'OUT_OF_SERVICE' ? (
              <p className="flex items-center gap-1.5 text-muted">
                <Wrench className="size-4" aria-hidden="true" />
                {t('orLive.maintenance')}
              </p>
            ) : booking ? (
              <>
                <p className="text-xs font-semibold text-muted">
                  {inRoom ? t('orLive.now') : t('orLive.next')}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                  {booking.kind === 'EMERGENCY' && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
                      <Siren className="size-3" aria-hidden="true" />
                      {t('bookings.emergency.label')}
                    </span>
                  )}
                  {booking.procedure ?? t('orLive.operation')}
                </p>
                <p className="text-muted">
                  {[booking.surgeonName, booking.patient ? patientName(booking.patient, t) : null]
                    .filter(Boolean)
                    .join(' · ') || t('orLive.noSurgeon')}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  {inRoom ? (
                    <span>
                      {t('orLive.endsAround')} <bdi>{time.format(new Date(booking.endsAt))}</bdi>
                    </span>
                  ) : (
                    <span>
                      {t('orLive.at')} <bdi>{time.format(new Date(booking.startsAt))}</bdi>
                    </span>
                  )}
                  {room.status === 'IN_SURGERY' && booking.startedAt && (
                    <span className="inline-flex items-center gap-1 font-semibold text-danger">
                      <Timer className="size-3.5" aria-hidden="true" />
                      {t('orBoard.elapsed', { time: clock(booking.startedAt, now) })}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-muted">{t('orLive.free')}</p>
            )}
          </motion.div>
        </AnimatePresence>

        {isAdmin && (room.status === 'AVAILABLE' || room.status === 'OUT_OF_SERVICE') && (
          <Button
            size="sm"
            variant={room.status === 'AVAILABLE' ? 'outline' : 'success'}
            icon={
              room.status === 'AVAILABLE' ? (
                <Wrench className="size-4" />
              ) : (
                <Power className="size-4" />
              )
            }
            onClick={() => onService(room)}
          >
            {room.status === 'AVAILABLE' ? t('orLive.takeOut') : t('orLive.bringBack')}
          </Button>
        )}
      </Card>
    </motion.li>
  );
}

// The live operating room board (task 2.26): every room's state, what is in
// it and what comes next, updating by itself; the admin takes free rooms out
// of service and back.
export function OrLiveBoard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isAdmin = useSessionStore((s) => s.user?.role === 'ADMIN');
  const [servicing, setServicing] = useState<OrBoardRoom | null>(null);
  const { data: rooms = [], isPending } = useQuery({
    queryKey: queryKeys.orLive,
    queryFn: async () =>
      (await api.get<{ rooms: OrBoardRoom[] }>('/operating-rooms/live')).data.rooms,
  });
  const service = useMutation({
    mutationFn: (room: OrBoardRoom) =>
      api.patch(
        `/operating-rooms/${room.id}/service`,
        { outOfService: room.status === 'AVAILABLE' },
        { skipErrorToast: true },
      ),
    onSuccess: (_, room) =>
      notify.success(
        t(room.status === 'AVAILABLE' ? 'orLive.tookOut' : 'orLive.broughtBack', {
          room: room.name,
        }),
      ),
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: () => {
      setServicing(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
    },
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (rooms.length === 0) {
    return (
      <Card className="px-6 py-10 text-center text-sm text-muted">{t('orBoard.noRooms')}</Card>
    );
  }

  const counts = ORDER.map((status) => ({
    status,
    count: rooms.filter((r) => r.status === status).length,
  })).filter((c) => c.count > 0);
  const takingOut = servicing?.status === 'AVAILABLE';

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label={t('orLive.summary')}>
        <AnimatePresence initial={false}>
          {counts.map(({ status, count }) => (
            <motion.li
              key={status}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={calm}
            >
              <StatusBadge tone={OR_TONE[status]}>
                {t(`orStatus.${status}`)} · <span className="tabular-nums">{count}</span>
              </StatusBadge>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => (
          <RoomTile key={room.id} room={room} isAdmin={isAdmin} onService={setServicing} />
        ))}
      </ul>
      <Modal
        open={servicing !== null}
        onClose={() => setServicing(null)}
        title={t(takingOut ? 'orLive.takeOutTitle' : 'orLive.bringBackTitle', {
          room: servicing?.name ?? '',
        })}
        description={t(takingOut ? 'orLive.takeOutBody' : 'orLive.bringBackBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setServicing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={takingOut ? 'danger' : 'success'}
              loading={service.isPending}
              onClick={() => servicing && service.mutate(servicing)}
            >
              {takingOut ? t('orLive.takeOut') : t('orLive.bringBack')}
            </Button>
          </>
        }
      />
    </div>
  );
}
