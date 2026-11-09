import { BED_STATUSES, type EsiLevel, type WardBed, type WardBoard } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Ambulance, BedDouble, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { ESI_BG } from '@/components/er/esiStyles';
import { patientName } from '@/components/patients/patientDisplay';
import { BED_TILE_CLASSES } from '@/components/rooms/bedStyles';
import { Button, Card, Spinner } from '@/components/ui';
import { BedPanel, type AdmitChoice } from '@/components/ward/BedPanel';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';

/** "3 d", "5 h", "20 min" since a time, short enough for a bed tile. */
function useSince() {
  const { t } = useTranslation();
  const now = useNow(60_000);
  return (iso: string) => {
    const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
    if (minutes >= 1440) return t('ward.days', { count: Math.floor(minutes / 1440) });
    if (minutes >= 60) return t('ward.hours', { count: Math.floor(minutes / 60) });
    return t('ward.minutes', { count: minutes });
  };
}

function BedTile({ bed, onOpen }: { bed: WardBed; onOpen: () => void }) {
  const { t } = useTranslation();
  const since = useSince();
  const status = t(`bedStatus.${bed.status}`);
  const who = bed.stay ? patientName(bed.stay.patient, t) : null;
  return (
    <motion.li layout transition={calm}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('ward.bedLabel', { bed: bed.label, status, patient: who ?? '' }).trim()}
        className={cn(
          'flex h-full min-h-24 w-full flex-col gap-1 rounded-xl border p-3 text-start transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lifted focus-visible:outline-2 focus-visible:outline-accent',
          BED_TILE_CLASSES[bed.status],
        )}
      >
        <span className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="size-3.5" aria-hidden="true" />
            <span dir="ltr">{bed.label}</span>
          </span>
          <span>{status}</span>
        </span>
        {bed.stay ? (
          <>
            <span className="line-clamp-2 text-sm font-semibold text-foreground">{who}</span>
            <span className="mt-auto text-xs text-muted">
              {since(bed.stay.admittedAt)}
              {bed.stay.fromEr && ` · ${t('ward.erShort')}`}
            </span>
          </>
        ) : (
          <span className="mt-auto text-xs opacity-80">{since(bed.statusChangedAt)}</span>
        )}
      </button>
    </motion.li>
  );
}

// The ward nurse's board (task 3.16): every bed of the department with who is
// in it, the patients the ER sent here waiting for a bed, and admitting,
// moving and discharging from the bed itself. Live for the whole ward.
export function WardPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ bedId: string; preset: AdmitChoice | null } | null>(null);
  const [placing, setPlacing] = useState<AdmitChoice | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.ward,
    queryFn: async () => (await api.get<WardBoard>('/ward/board', { skipErrorToast: true })).data,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="mx-auto max-w-xl px-6 py-12 text-center text-sm text-muted">
        {describeApiError(error).status === 403
          ? t('ward.noWard')
          : describeApiError(error).message}
      </Card>
    );
  }

  const beds = data.rooms.flatMap((room) => room.beds.map((bed) => ({ bed, room: room.number })));
  const counts = BED_STATUSES.map(
    (status) => [status, beds.filter((b) => b.bed.status === status).length] as const,
  );
  const target = open ? (beds.find((b) => b.bed.id === open.bedId) ?? null) : null;
  const freeBed = (bed: WardBed) => bed.status === 'EMPTY' || bed.status === 'RESERVED';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">
          {t('ward.title', { department: departmentLabel(data.department, t) })}
        </h2>
        <p className="text-sm text-muted">{t('ward.description')}</p>
      </motion.div>

      <motion.ul {...enter(1)} aria-label={t('ward.summary')} className="flex flex-wrap gap-2">
        {counts.map(([status, count]) => (
          <li
            key={status}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold tabular-nums',
              BED_TILE_CLASSES[status],
            )}
          >
            {t(`bedStatus.${status}`)} · {count}
          </li>
        ))}
      </motion.ul>

      <AnimatePresence initial={false}>
        {data.incoming.length > 0 && (
          <motion.section
            key="incoming"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={calm}
            aria-label={t('ward.incoming')}
            className="space-y-3"
          >
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Ambulance className="size-5 text-accent" aria-hidden="true" />
              {t('ward.incoming')}
              <span className="rounded-full bg-warning/15 px-2 text-xs text-warning tabular-nums">
                {data.incoming.length}
              </span>
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.incoming.map((visit) => {
                const name = patientName(visit.patient, t);
                const choosing = placing?.kind === 'visit' && placing.id === visit.visitId;
                return (
                  <motion.li key={visit.visitId} layout transition={calm}>
                    <Card
                      aria-label={name}
                      className={cn(
                        'flex h-full flex-col gap-2 p-4',
                        choosing && 'ring-2 ring-accent',
                      )}
                    >
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        {visit.level && (
                          <span
                            className={cn(
                              'rounded px-1.5 text-xs font-bold',
                              ESI_BG[visit.level as EsiLevel],
                            )}
                          >
                            {visit.level}
                          </span>
                        )}
                        {name}
                      </p>
                      {visit.chiefComplaint && (
                        <p className="text-sm text-foreground">{visit.chiefComplaint}</p>
                      )}
                      {visit.closingNote && (
                        <p className="text-xs text-muted">{visit.closingNote}</p>
                      )}
                      <Button
                        size="sm"
                        variant={choosing ? 'primary' : 'outline'}
                        className="mt-auto"
                        icon={<UserPlus className="size-4" />}
                        onClick={() =>
                          setPlacing(choosing ? null : { kind: 'visit', id: visit.visitId, name })
                        }
                      >
                        {choosing ? t('ward.pickBed') : t('ward.giveBed')}
                      </Button>
                    </Card>
                  </motion.li>
                );
              })}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      {data.rooms.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">{t('ward.noRooms')}</Card>
      ) : (
        <motion.div {...enter(2)} className="grid gap-4 lg:grid-cols-2">
          {data.rooms.map((room) => (
            <section key={room.id} aria-label={t('ward.room', { room: room.number })}>
              <Card className="space-y-3 p-4">
                <h3 className="flex items-baseline justify-between gap-2 font-semibold text-foreground">
                  {t('ward.room', { room: room.number })}
                  {room.floor !== null && (
                    <span className="text-xs font-normal text-muted">
                      {t('ward.floor', { floor: room.floor })}
                    </span>
                  )}
                </h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {room.beds.map((bed) => (
                    <BedTile
                      key={bed.id}
                      bed={bed}
                      onOpen={() => {
                        const preset = placing && freeBed(bed) ? placing : null;
                        setOpen({ bedId: bed.id, preset });
                      }}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </motion.div>
      )}

      <BedPanel
        target={target}
        rooms={data.rooms}
        incoming={data.incoming}
        preset={open?.preset ?? null}
        onClose={() => {
          setOpen(null);
          setPlacing(null);
        }}
      />
    </div>
  );
}
