import { BED_STATUSES, type BedMapBed, type BedMapDepartment, type BedStatus } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BedDouble } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { patientName } from '@/components/patients/patientDisplay';
import { BED_TILE_CLASSES } from '@/components/rooms/bedStyles';
import { Card, Spinner } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';

/** The bar colour of each state, matching the tiles. */
const BAR: Record<BedStatus, string> = {
  EMPTY: 'bg-success',
  RESERVED: 'bg-info',
  OCCUPIED: 'bg-danger',
  CLEANING: 'bg-warning',
  OUT_OF_SERVICE: 'bg-muted/50',
};

const bedsOf = (entry: BedMapDepartment) => entry.rooms.flatMap((room) => room.beds);

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

/** The share of each state as one bar, with the legend under it. */
function StateBar({ beds }: { beds: BedMapBed[] }) {
  const { t } = useTranslation();
  const counts = BED_STATUSES.map(
    (status) => [status, beds.filter((b) => b.status === status).length] as const,
  );
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        {counts.map(([status, count]) => (
          <motion.span
            key={status}
            className={BAR[status]}
            initial={false}
            animate={{ width: beds.length ? `${(count / beds.length) * 100}%` : 0 }}
            transition={calm}
          />
        ))}
      </div>
      <ul
        aria-label={t('bedMap.legend')}
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
      >
        {counts.map(([status, count]) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', BAR[status])} aria-hidden="true" />
            {t(`bedStatus.${status}`)}
            <span className="font-semibold text-foreground tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ bed }: { bed: BedMapBed }) {
  const { t } = useTranslation();
  const since = useSince();
  const who = bed.patient ? patientName(bed.patient, t) : null;
  const status = t(`bedStatus.${bed.status}`);
  return (
    <motion.li
      layout
      transition={calm}
      aria-label={t('bedMap.bed', { bed: bed.label, status, patient: who ?? '' }).trim()}
      title={who ? `${who} · ${since(bed.admittedAt ?? bed.statusChangedAt)}` : status}
      className={cn(
        'flex min-h-16 flex-col justify-between rounded-lg border p-2 text-xs transition-colors duration-500',
        BED_TILE_CLASSES[bed.status],
      )}
    >
      <span className="flex items-center justify-between gap-1 font-semibold">
        <span className="inline-flex items-center gap-1">
          <BedDouble className="size-3" aria-hidden="true" />
          <span dir="ltr">{bed.label}</span>
        </span>
        {bed.status === 'OCCUPIED' && (
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
        )}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={who ?? bed.status}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={calm}
          className={cn('truncate', who ? 'font-medium text-foreground' : 'opacity-80')}
        >
          {who ?? status}
        </motion.span>
      </AnimatePresence>
    </motion.li>
  );
}

// The live map of rooms and beds (task 3.18): a department at a time, floor by
// floor, every bed in its state's colour and who is in it. Changes anywhere
// (admissions, discharges, cleaning, the admin's rooms) refresh it at once.
export function BedMapPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: departments, isPending } = useQuery({
    queryKey: queryKeys.bedMap,
    queryFn: async () =>
      (await api.get<{ departments: BedMapDepartment[] }>('/beds/map')).data.departments,
  });

  if (isPending || !departments) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (departments.length === 0) {
    return (
      <Card className="mx-auto max-w-xl px-6 py-12 text-center text-sm text-muted">
        {t('bedMap.none')}
      </Card>
    );
  }

  const chosen =
    departments.find((d) => d.department.id === params.get('department')) ?? departments[0]!;
  const floors = [...new Set(chosen.rooms.map((room) => room.floor))];
  const all = departments.flatMap(bedsOf);
  const busy = (beds: BedMapBed[]) => beds.filter((b) => b.status === 'OCCUPIED').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            {t('bedMap.title')}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
              <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
              {t('bedMap.live')}
            </span>
          </h2>
          <p className="text-sm text-muted">{t('bedMap.description')}</p>
        </div>
        <p className="text-sm text-muted">
          {t('bedMap.hospital', { busy: busy(all), total: all.length })}
        </p>
      </motion.div>

      <motion.div
        {...enter(1)}
        role="tablist"
        aria-label={t('bedMap.departments')}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {departments.map((entry) => {
          const beds = bedsOf(entry);
          const selected = entry === chosen;
          return (
            <button
              key={entry.department.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() =>
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.set('department', entry.department.id);
                    return next;
                  },
                  { replace: true },
                )
              }
              className={cn(
                'shrink-0 space-y-1 rounded-xl border px-3 py-2 text-start transition-colors',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-surface hover:border-accent/50',
              )}
            >
              <span className="block text-sm font-semibold text-foreground">
                {departmentLabel(entry.department, t)}
              </span>
              <span className="block text-xs text-muted tabular-nums">
                {t('bedMap.occupancy', { busy: busy(beds), total: beds.length })}
              </span>
            </button>
          );
        })}
      </motion.div>

      <motion.div key={chosen.department.id} {...enter(2)} className="space-y-6">
        <Card className="p-4">
          <StateBar beds={bedsOf(chosen)} />
        </Card>
        {floors.map((floor) => (
          <section
            key={floor ?? 'none'}
            aria-label={floor === null ? t('bedMap.noFloor') : t('ward.floor', { floor })}
            className="space-y-3"
          >
            <h3 className="text-sm font-semibold text-muted">
              {floor === null ? t('bedMap.noFloor') : t('ward.floor', { floor })}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chosen.rooms
                .filter((room) => room.floor === floor)
                .map((room) => (
                  <Card
                    key={room.id}
                    aria-label={t('ward.room', { room: room.number })}
                    className="space-y-2 p-3"
                  >
                    <p className="flex items-baseline justify-between text-sm font-semibold text-foreground">
                      {t('ward.room', { room: room.number })}
                      <span className="text-xs font-normal text-muted tabular-nums">
                        {busy(room.beds)}/{room.beds.length}
                      </span>
                    </p>
                    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {room.beds.map((bed) => (
                        <Tile key={bed.id} bed={bed} />
                      ))}
                    </ul>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </motion.div>
    </div>
  );
}
