import { zodResolver } from '@hookform/resolvers/zod';
import {
  BED_STATUSES,
  BED_STATUSES_IN_USE,
  createRoomSchema,
  MAX_BEDS_PER_ROOM,
  type ValidationKey,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BedDouble, DoorOpen, Hash, Layers, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { queryKeys } from '@/app/queryKeys';
import { DepartmentIcon } from '@/components/departments/DepartmentIcon';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import { BED_TILE_CLASSES, BED_TONE, type Bed, type Room } from '@/components/rooms/bedStyles';
import { BedHistory } from '@/components/rooms/BedHistory';
import { Button, Card, Input, Modal, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calmSpring, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type RoomForm = { mode: 'create' } | { mode: 'edit'; room: Room } | null;

// The form checks only what the user can see and fix; the department is added
// when sending (a hidden field failing validation would block the form silently).
const roomFormSchema = createRoomSchema.omit({ departmentId: true });
type CreateValues = z.input<typeof roomFormSchema>;

/** Validation messages are translation keys; server messages arrive translated. */
function errorText(message: string | undefined, t: (key: ValidationKey) => string) {
  if (!message) return undefined;
  return message.startsWith('validation.') ? t(message as ValidationKey) : message;
}

const toNumberOrNull = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);

function RoomFormDialog({
  form,
  departmentId,
  onClose,
}: {
  form: RoomForm;
  departmentId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editing = form?.mode === 'edit' ? form.room : null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    // One schema for both: when editing, the bed count is prefilled with a valid
    // value and only number and floor are sent.
    resolver: zodResolver(roomFormSchema),
  });

  useEffect(() => {
    if (form) {
      reset({
        number: editing?.number ?? '',
        floor: editing?.floor ?? null,
        bedCount: editing?.beds.length ?? 2,
      });
    }
  }, [form, editing, departmentId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (editing) {
        await api.patch(
          `/rooms/${editing.id}`,
          { number: values.number, floor: values.floor },
          { skipErrorToast: true },
        );
        notify.success(t('rooms.saved'));
      } else {
        await api.post('/rooms', { ...values, departmentId }, { skipErrorToast: true });
        notify.success(t('rooms.created', { number: values.number.trim() }));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms(departmentId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
      ]);
      onClose();
    } catch (error) {
      setError('number', { message: describeApiError(error).message });
    }
  });

  return (
    <Modal
      open={form !== null}
      onClose={onClose}
      title={editing ? t('rooms.editTitle', { number: editing.number }) : t('rooms.addTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="room-form" loading={isSubmitting}>
            {editing ? t('common.save') : t('rooms.create')}
          </Button>
        </>
      }
    >
      <form id="room-form" noValidate onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('rooms.number')}
          placeholder={t('rooms.numberPlaceholder')}
          icon={<Hash />}
          required
          dir="ltr"
          error={errorText(errors.number?.message, t)}
          {...register('number')}
        />
        <Input
          label={`${t('rooms.floor')} (${t('rooms.optional')})`}
          icon={<Layers />}
          type="number"
          inputMode="numeric"
          dir="ltr"
          error={errorText(errors.floor?.message, t)}
          {...register('floor', { setValueAs: toNumberOrNull })}
        />
        {!editing && (
          <Input
            label={t('rooms.bedCount')}
            hint={t('rooms.bedCountHint')}
            icon={<BedDouble />}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BEDS_PER_ROOM}
            dir="ltr"
            containerClassName="sm:col-span-2"
            error={errorText(errors.bedCount?.message, t)}
            {...register('bedCount', { valueAsNumber: true })}
          />
        )}
      </form>
    </Modal>
  );
}

function BedDialog({
  target,
  departmentId,
  onClose,
}: {
  target: { bed: Bed; room: Room } | null;
  departmentId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms(departmentId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
    ]);

  const toggle = useMutation({
    mutationFn: async (outOfService: boolean) =>
      api.patch(`/beds/${target!.bed.id}`, { outOfService }),
    onSuccess: async () => {
      await refresh();
      notify.success(t('rooms.bedUpdated'));
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/beds/${target!.bed.id}`),
    onSuccess: async () => {
      await refresh();
      notify.success(t('rooms.bedRemoved'));
      onClose();
    },
  });

  const bed = target?.bed;
  const inUse = bed ? BED_STATUSES_IN_USE.includes(bed.status) : false;
  const outOfService = bed?.status === 'OUT_OF_SERVICE';
  const cleaning = bed?.status === 'CLEANING';

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={
        target ? t('rooms.bedTitle', { label: target.bed.label, number: target.room.number }) : ''
      }
      size="sm"
    >
      {bed && (
        <div className="space-y-4">
          <StatusBadge tone={BED_TONE[bed.status]}>{t(`bedStatus.${bed.status}`)}</StatusBadge>
          {inUse || cleaning ? (
            <p className="text-sm text-muted">
              {cleaning ? t('rooms.cleaningHint') : t('rooms.inUseHint')}
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                icon={<Wrench className="size-4" />}
                loading={toggle.isPending}
                onClick={() => toggle.mutate(!outOfService)}
              >
                {outOfService ? t('rooms.backToService') : t('rooms.outOfService')}
              </Button>
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger/10"
                icon={<Trash2 className="size-4" />}
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('rooms.removeBed')}
              </Button>
            </div>
          )}
          <BedHistory bedId={bed.id} />
        </div>
      )}
    </Modal>
  );
}

function RoomCard({
  room,
  onEdit,
  onDelete,
  onBed,
  onAddBed,
  addingBed,
}: {
  room: Room;
  onEdit: () => void;
  onDelete: () => void;
  onBed: (bed: Bed) => void;
  onAddBed: () => void;
  addingBed: boolean;
}) {
  const { t } = useTranslation();

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={calmSpring}
    >
      <Card className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <DoorOpen className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">
              {t('rooms.room', { number: room.number })}
            </h3>
            <p className="text-xs text-muted">
              {[
                room.floor !== null ? t('rooms.floorLabel', { floor: room.floor }) : null,
                t('rooms.beds', { count: room.beds.length }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-9 text-muted hover:text-foreground"
              aria-label={t('rooms.edit', { number: room.number })}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
              aria-label={t('rooms.delete', { number: room.number })}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <ul className="flex flex-wrap gap-2" aria-label={t('rooms.room', { number: room.number })}>
          <AnimatePresence mode="popLayout" initial={false}>
            {room.beds.map((bed) => {
              const status = t(`bedStatus.${bed.status}`);
              return (
                <motion.li
                  key={bed.id}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={calmSpring}
                >
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onBed(bed)}
                    aria-label={t('rooms.bed', { label: bed.label, status })}
                    title={status}
                    className={cn(
                      'flex size-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                      BED_TILE_CLASSES[bed.status],
                    )}
                  >
                    <BedDouble className="size-4" aria-hidden="true" />
                    <span dir="ltr">{bed.label}</span>
                  </motion.button>
                </motion.li>
              );
            })}
            {room.beds.length < MAX_BEDS_PER_ROOM && (
              <motion.li key="add" layout transition={calmSpring}>
                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  disabled={addingBed}
                  onClick={onAddBed}
                  aria-label={t('rooms.addBed', { number: room.number })}
                  className="flex size-14 items-center justify-center rounded-xl border border-dashed border-input text-muted transition-colors hover:border-accent hover:text-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <Plus className="size-5" aria-hidden="true" />
                </motion.button>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      </Card>
    </motion.li>
  );
}

// Admin: rooms and beds of each department (task 1.25).
export function RoomsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [roomForm, setRoomForm] = useState<RoomForm>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [bedTarget, setBedTarget] = useState<{ bed: Bed; room: Room } | null>(null);

  const { data: departments, isPending: loadingDepartments } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
  });

  // The chosen department lives in the URL, so a reload or a shared link keeps it.
  const departmentId =
    departments?.find((d) => d.id === params.get('department'))?.id ?? departments?.[0]?.id;

  const { data: rooms, isPending: loadingRooms } = useQuery({
    queryKey: queryKeys.rooms(departmentId ?? ''),
    queryFn: async () =>
      (await api.get<{ rooms: Room[] }>('/rooms', { params: { departmentId } })).data.rooms,
    enabled: Boolean(departmentId),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms(departmentId ?? '') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
    ]);

  const addBed = useMutation({
    mutationFn: async (room: Room) => api.post(`/rooms/${room.id}/beds`, {}),
    onSuccess: async () => {
      await refresh();
      playSound('success');
    },
  });

  const removeRoom = useMutation({
    mutationFn: async (room: Room) => api.delete(`/rooms/${room.id}`),
    onSuccess: async () => {
      await refresh();
      notify.success(t('rooms.deleted'));
    },
    onSettled: () => setDeleting(null),
  });

  const allBeds = rooms?.flatMap((room) => room.beds) ?? [];

  if (!loadingDepartments && departments?.length === 0) {
    return (
      <motion.div {...enter(0)} className="mx-auto max-w-3xl">
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <DoorOpen className="size-7" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{t('rooms.noDepartmentsTitle')}</p>
            <p className="max-w-md text-sm text-muted">{t('rooms.noDepartmentsBody')}</p>
          </div>
          <Link
            to="/admin/departments"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition-shadow hover:shadow-lifted"
          >
            {t('rooms.goToDepartments')}
          </Link>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('rooms.title')}</h2>
          <p className="text-sm text-muted">{t('rooms.description')}</p>
        </div>
        <Button
          icon={<Plus className="size-4" />}
          disabled={!departmentId}
          onClick={() => setRoomForm({ mode: 'create' })}
        >
          {t('rooms.add')}
        </Button>
      </motion.div>

      {/* Department picker: scrolls sideways on its own on narrow screens */}
      <motion.div {...enter(1)} className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div role="group" aria-label={t('rooms.departments')} className="flex w-max gap-2">
          {(departments ?? []).map((department) => {
            const active = department.id === departmentId;
            return (
              <button
                key={department.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  playSound('toggle');
                  setParams({ department: department.id }, { replace: true });
                }}
                className={cn(
                  'relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                  active ? 'text-accent' : 'bg-surface-muted text-muted hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rooms-department"
                    className="absolute inset-0 rounded-full bg-accent-soft ring-1 ring-accent/30"
                    transition={calmSpring}
                  />
                )}
                <DepartmentIcon code={department.code} className="relative size-4" />
                <span className="relative">{departmentLabel(department, t)}</span>
                <span className="relative rounded-full bg-surface px-1.5 text-[11px] text-muted">
                  {department.roomCount}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        {...enter(2)}
        className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted"
      >
        <p>
          {t('rooms.summary', {
            rooms: rooms?.length ?? 0,
            beds: allBeds.length,
            empty: allBeds.filter((bed) => bed.status === 'EMPTY').length,
          })}
        </p>
        <div className="flex flex-wrap gap-1.5" aria-label={t('rooms.legend')}>
          {BED_STATUSES.map((status) => (
            <StatusBadge key={status} tone={BED_TONE[status]}>
              {t(`bedStatus.${status}`)}
            </StatusBadge>
          ))}
        </div>
      </motion.div>

      {loadingDepartments || loadingRooms ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : rooms && rooms.length > 0 ? (
        <motion.ul
          layout
          aria-label={t('rooms.title')}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onEdit={() => setRoomForm({ mode: 'edit', room })}
                onDelete={() => setDeleting(room)}
                onBed={(bed) => setBedTarget({ bed, room })}
                onAddBed={() => addBed.mutate(room)}
                addingBed={addBed.isPending}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <motion.div {...enter(3)}>
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <BedDouble className="size-8 text-muted" aria-hidden="true" />
            <p className="font-semibold text-foreground">{t('rooms.emptyTitle')}</p>
            <p className="text-sm text-muted">{t('rooms.emptyBody')}</p>
          </Card>
        </motion.div>
      )}

      {departmentId && (
        <>
          <RoomFormDialog
            form={roomForm}
            departmentId={departmentId}
            onClose={() => setRoomForm(null)}
          />
          <BedDialog
            target={bedTarget}
            departmentId={departmentId}
            onClose={() => setBedTarget(null)}
          />
        </>
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('rooms.deleteTitle', { number: deleting.number }) : ''}
        description={t('rooms.deleteBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removeRoom.isPending}
              onClick={() => deleting && removeRoom.mutate(deleting)}
            >
              {deleting ? t('rooms.delete', { number: deleting.number }) : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
