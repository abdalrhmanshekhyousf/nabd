import type {
  AdmissionCandidate,
  EsiLevel,
  IncomingPatient,
  WardBed,
  WardRoom,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  BedDouble,
  BookmarkCheck,
  BookmarkX,
  Check,
  LogOut,
  Search,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { ESI_BG } from '@/components/er/esiStyles';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { BedHistory } from '@/components/rooms/BedHistory';
import { BED_TONE } from '@/components/rooms/bedStyles';
import { Button, Input, Modal, StatusBadge, Textarea } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type Choice =
  { kind: 'visit'; id: string; name: string } | { kind: 'patient'; id: string; name: string };

function useWardAction<T>(fn: (input: T) => Promise<unknown>, done: string, onDone: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      notify.success(done);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ward });
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });
  return { ...mutation, error, setError, t };
}

function Option({
  chosen,
  onClick,
  children,
}: {
  chosen: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        onClick={() => {
          playSound('tap');
          onClick();
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors',
          chosen ? 'bg-accent-soft' : 'hover:bg-surface-muted',
        )}
      >
        <span className="min-w-0 flex-1">{children}</span>
        <AnimatePresence>
          {chosen && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={calm}
            >
              <Check className="size-4 text-accent" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </li>
  );
}

/** Admitting into this bed: an ER transfer waiting here, or a patient found by name. */
function AdmitForm({
  bed,
  incoming,
  preset,
  onDone,
}: {
  bed: WardBed;
  incoming: IncomingPatient[];
  preset: Choice | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<Choice | null>(preset);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const needle = useDebouncedValue(search.trim(), 300);
  const { data: found } = useQuery({
    queryKey: queryKeys.wardCandidates(needle),
    queryFn: async () =>
      (
        await api.get<{ patients: AdmissionCandidate[] }>('/ward/patients', {
          params: { search: needle },
        })
      ).data.patients,
    enabled: needle.length >= 2,
  });
  const admit = useWardAction(
    () =>
      api.post(
        '/ward/admissions',
        {
          bedId: bed.id,
          visitId: choice?.kind === 'visit' ? choice.id : null,
          patientId: choice?.kind === 'patient' ? choice.id : null,
          notes,
        },
        { skipErrorToast: true },
      ),
    t('ward.admitted', { patient: choice?.name ?? '' }),
    onDone,
  );

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!choice) {
          admit.setError(t('ward.pickPatient'));
          return playSound('error');
        }
        admit.mutate(undefined);
      }}
    >
      {incoming.length > 0 && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">{t('ward.fromEr')}</legend>
          <ul
            role="radiogroup"
            aria-label={t('ward.fromEr')}
            className="space-y-1 rounded-lg border border-border p-1"
          >
            {incoming.map((visit) => {
              const name = patientName(visit.patient, t);
              return (
                <Option
                  key={visit.visitId}
                  chosen={choice?.kind === 'visit' && choice.id === visit.visitId}
                  onClick={() => setChoice({ kind: 'visit', id: visit.visitId, name })}
                >
                  <span className="flex items-center gap-2">
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
                    <span className="truncate text-sm font-medium text-foreground">{name}</span>
                  </span>
                  {visit.chiefComplaint && (
                    <span className="block truncate text-xs text-muted">
                      {visit.chiefComplaint}
                    </span>
                  )}
                </Option>
              );
            })}
          </ul>
        </fieldset>
      )}
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {t('ward.findPatient')}
        </legend>
        <Input
          label={t('ward.searchPatient')}
          icon={<Search />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {needle.length >= 2 && found && (
          <ul
            role="radiogroup"
            aria-label={t('ward.findPatient')}
            className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1"
          >
            {found.length === 0 && (
              <li className="px-3 py-3 text-center text-sm text-muted">{t('ward.noPatient')}</li>
            )}
            {found.map((patient) => {
              const name = patientName(patient, t);
              return (
                <Option
                  key={patient.patientId}
                  chosen={choice?.kind === 'patient' && choice.id === patient.patientId}
                  onClick={() => setChoice({ kind: 'patient', id: patient.patientId, name })}
                >
                  <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                  <span className="block truncate text-xs text-muted">
                    {patientFacts(patient, t)}
                  </span>
                </Option>
              );
            })}
          </ul>
        )}
      </fieldset>
      <Textarea
        label={t('ward.notes')}
        hint={t('ward.notesHint')}
        rows={2}
        maxLength={500}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      {admit.error && (
        <p role="alert" className="text-sm text-danger">
          {admit.error}
        </p>
      )}
      <Button
        type="submit"
        className="w-full"
        loading={admit.isPending}
        icon={<UserPlus className="size-4" />}
      >
        {choice ? t('ward.admitName', { patient: choice.name }) : t('ward.admit')}
      </Button>
    </form>
  );
}

/** The patient in this bed: move to a free bed of the ward, or discharge. */
function StayActions({
  bed,
  rooms,
  onDone,
}: {
  bed: WardBed;
  rooms: WardRoom[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const stay = bed.stay!;
  const name = patientName(stay.patient, t);
  const [mode, setMode] = useState<'move' | 'discharge' | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const free = rooms.flatMap((room) =>
    room.beds
      .filter((b) => b.status === 'EMPTY' || b.status === 'RESERVED')
      .map((b) => ({ ...b, room: room.number })),
  );
  const move = useWardAction(
    () => api.post(`/ward/stays/${stay.id}/move`, { bedId: target }, { skipErrorToast: true }),
    t('ward.moved', { patient: name }),
    onDone,
  );
  const discharge = useWardAction(
    () => api.post(`/ward/stays/${stay.id}/discharge`, { notes }, { skipErrorToast: true }),
    t('ward.discharged', { patient: name }),
    onDone,
  );
  const when = new Intl.DateTimeFormat(useTranslation().i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-lg bg-surface-muted px-3 py-2">
        <p className="font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted">{patientFacts(stay.patient, t)}</p>
        <p className="text-xs text-muted">
          {t('ward.admittedBy', { name: stay.admittedByName })} ·{' '}
          <bdi>{when.format(new Date(stay.admittedAt))}</bdi>
          {stay.fromEr && ` · ${t('ward.cameFromEr')}`}
        </p>
        {stay.notes && <p className="text-sm text-foreground">{stay.notes}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant={mode === 'move' ? 'primary' : 'outline'}
          icon={<ArrowLeftRight className="size-4" />}
          onClick={() => setMode(mode === 'move' ? null : 'move')}
          aria-expanded={mode === 'move'}
        >
          {t('ward.move')}
        </Button>
        <Button
          variant={mode === 'discharge' ? 'primary' : 'outline'}
          icon={<LogOut className="size-4 rtl:-scale-x-100" />}
          onClick={() => setMode(mode === 'discharge' ? null : 'discharge')}
          aria-expanded={mode === 'discharge'}
        >
          {t('ward.discharge')}
        </Button>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {mode === 'move' && (
          <motion.div
            key="move"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={calm}
            className="space-y-3 overflow-hidden"
          >
            {free.length === 0 ? (
              <p className="text-sm text-muted">{t('ward.noFreeBed')}</p>
            ) : (
              <ul role="radiogroup" aria-label={t('ward.moveTo')} className="flex flex-wrap gap-2">
                {free.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={target === b.id}
                      onClick={() => {
                        playSound('tap');
                        setTarget(b.id);
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                        target === b.id
                          ? 'border-accent bg-accent text-white'
                          : 'border-border text-foreground hover:border-accent',
                      )}
                    >
                      {t('ward.bedInRoom', { bed: b.label, room: b.room })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {move.error && (
              <p role="alert" className="text-sm text-danger">
                {move.error}
              </p>
            )}
            <Button
              className="w-full"
              disabled={!target}
              loading={move.isPending}
              icon={<ArrowLeftRight className="size-4" />}
              onClick={() => move.mutate(undefined)}
            >
              {t('ward.confirmMove')}
            </Button>
          </motion.div>
        )}
        {mode === 'discharge' && (
          <motion.div
            key="discharge"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={calm}
            className="space-y-3 overflow-hidden"
          >
            <Textarea
              label={t('ward.dischargeNotes')}
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <p className="text-xs text-muted">{t('ward.dischargeHint')}</p>
            {discharge.error && (
              <p role="alert" className="text-sm text-danger">
                {discharge.error}
              </p>
            )}
            <Button
              variant="danger"
              className="w-full"
              loading={discharge.isPending}
              icon={<LogOut className="size-4 rtl:-scale-x-100" />}
              onClick={() => discharge.mutate(undefined)}
            >
              {t('ward.confirmDischarge', { patient: name })}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Holding a bed for someone coming, freeing it, or marking it clean. */
function StatusActions({ bed, onDone }: { bed: WardBed; onDone: () => void }) {
  const { t } = useTranslation();
  const set = useWardAction(
    (to: 'RESERVED' | 'EMPTY') =>
      api.post(`/ward/beds/${bed.id}/status`, { to, reason: null }, { skipErrorToast: true }),
    t('ward.bedUpdated'),
    onDone,
  );
  return (
    <div className="space-y-2">
      {bed.status === 'EMPTY' && (
        <Button
          variant="outline"
          className="w-full"
          icon={<BookmarkCheck className="size-4" />}
          loading={set.isPending}
          onClick={() => set.mutate('RESERVED')}
        >
          {t('ward.reserve')}
        </Button>
      )}
      {bed.status === 'RESERVED' && (
        <Button
          variant="outline"
          className="w-full"
          icon={<BookmarkX className="size-4" />}
          loading={set.isPending}
          onClick={() => set.mutate('EMPTY')}
        >
          {t('ward.unreserve')}
        </Button>
      )}
      {bed.status === 'CLEANING' && (
        <>
          <p className="text-sm text-muted">{t('ward.cleaningHint')}</p>
          <Button
            variant="success"
            className="w-full"
            icon={<Sparkles className="size-4" />}
            loading={set.isPending}
            onClick={() => set.mutate('EMPTY')}
          >
            {t('ward.markClean')}
          </Button>
        </>
      )}
      {bed.status === 'OUT_OF_SERVICE' && (
        <p className="text-sm text-muted">{t('ward.outOfServiceHint')}</p>
      )}
      {set.error && (
        <p role="alert" className="text-sm text-danger">
          {set.error}
        </p>
      )}
    </div>
  );
}

// One bed of the ward (task 3.16): who is in it and what the nurse can do.
export function BedPanel({
  target,
  rooms,
  incoming,
  preset,
  onClose,
}: {
  target: { bed: WardBed; room: string } | null;
  rooms: WardRoom[];
  incoming: IncomingPatient[];
  preset: Choice | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const bed = target?.bed;
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target ? t('ward.bedTitle', { bed: target.bed.label, room: target.room }) : ''}
    >
      {bed && (
        <div className="space-y-5">
          <p className="flex items-center gap-2">
            <BedDouble className="size-4 text-muted" aria-hidden="true" />
            <StatusBadge tone={BED_TONE[bed.status]}>{t(`bedStatus.${bed.status}`)}</StatusBadge>
          </p>
          {bed.stay ? (
            <StayActions key={bed.id} bed={bed} rooms={rooms} onDone={onClose} />
          ) : (
            <>
              {(bed.status === 'EMPTY' || bed.status === 'RESERVED') && (
                <AdmitForm
                  key={bed.id}
                  bed={bed}
                  incoming={incoming}
                  preset={preset}
                  onDone={onClose}
                />
              )}
              <StatusActions bed={bed} onDone={onClose} />
            </>
          )}
          <BedHistory bedId={bed.id} />
        </div>
      )}
    </Modal>
  );
}

export type { Choice as AdmitChoice };
