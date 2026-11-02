import { zodResolver } from '@hookform/resolvers/zod';
import {
  OPERATING_ROOM_IDLE,
  operatingRoomSchema,
  type OperatingRoomInput,
  type ValidationKey,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { HeartPulse, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { OR_PULSE, OR_TONE, type OperatingRoom } from '@/components/operatingRooms/orStyles';
import { Button, Card, Input, Modal, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calmSpring, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

type Editing =
  { mode: 'create'; suggestion: string } | { mode: 'rename'; room: OperatingRoom } | null;

/** Validation messages are translation keys; server messages arrive translated. */
function errorText(message: string | undefined, t: (key: ValidationKey) => string) {
  if (!message) return undefined;
  return message.startsWith('validation.') ? t(message as ValidationKey) : message;
}

const isIdle = (room: OperatingRoom) => OPERATING_ROOM_IDLE.includes(room.status);

function NameDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const renaming = editing?.mode === 'rename' ? editing.room : null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OperatingRoomInput>({ resolver: zodResolver(operatingRoomSchema) });

  useEffect(() => {
    if (editing) {
      reset({ name: editing.mode === 'rename' ? editing.room.name : editing.suggestion });
    }
  }, [editing, reset]);

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      if (renaming) {
        await api.patch(`/operating-rooms/${renaming.id}`, { name }, { skipErrorToast: true });
        notify.success(t('operatingRooms.renamed'));
      } else {
        await api.post('/operating-rooms', { name }, { skipErrorToast: true });
        notify.success(t('operatingRooms.created', { name: name.trim() }));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      onClose();
    } catch (error) {
      setError('name', { message: describeApiError(error).message });
    }
  });

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={renaming ? t('operatingRooms.renameTitle') : t('operatingRooms.addTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="operating-room-form" loading={isSubmitting}>
            {renaming ? t('common.save') : t('operatingRooms.create')}
          </Button>
        </>
      }
    >
      <form id="operating-room-form" noValidate onSubmit={onSubmit}>
        <Input
          label={t('operatingRooms.name')}
          icon={<HeartPulse />}
          required
          error={errorText(errors.name?.message, t)}
          {...register('name')}
        />
      </form>
    </Modal>
  );
}

function OperatingRoomCard({
  room,
  onRename,
  onDelete,
}: {
  room: OperatingRoom;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const idle = isIdle(room);
  const outOfService = room.status === 'OUT_OF_SERVICE';
  const since = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(room.statusChangedAt));

  const toggle = useMutation({
    mutationFn: async () =>
      api.patch(`/operating-rooms/${room.id}/service`, { outOfService: !outOfService }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      notify.success(
        t(outOfService ? 'operatingRooms.serviceOn' : 'operatingRooms.serviceOff', {
          name: room.name,
        }),
      );
    },
  });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={calmSpring}
    >
      <Card
        className={cn(
          'flex h-full flex-col gap-4 p-4 transition-[box-shadow,opacity] hover:shadow-lifted',
          outOfService && 'opacity-80',
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              outOfService ? 'bg-surface-muted text-muted' : 'bg-accent-soft text-accent',
            )}
          >
            {outOfService ? (
              <Wrench className="size-5" aria-hidden="true" />
            ) : (
              <HeartPulse className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="truncate font-semibold text-foreground">{room.name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={OR_TONE[room.status]} pulse={OR_PULSE.has(room.status)}>
                {t(`orStatus.${room.status}`)}
              </StatusBadge>
              <span className="text-xs text-muted">
                {t('operatingRooms.since', { time: since })}
              </span>
            </div>
          </div>
          {idle && (
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted hover:text-foreground"
                aria-label={t('operatingRooms.rename', { name: room.name })}
                onClick={onRename}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={t('operatingRooms.delete', { name: room.name })}
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {idle ? (
          <Button
            size="sm"
            variant="outline"
            icon={<Wrench className="size-4" />}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
            className="self-start"
          >
            {outOfService ? t('operatingRooms.backToService') : t('operatingRooms.outOfService')}
          </Button>
        ) : (
          <p className="text-xs text-muted">{t('operatingRooms.busyHint')}</p>
        )}
      </Card>
    </motion.li>
  );
}

// Admin: the hospital's operating rooms (task 1.26). The full state machine and
// the live board for everyone come in tasks 2.19 and 2.26.
export function OperatingRoomsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<OperatingRoom | null>(null);

  const { data: rooms, isPending } = useQuery({
    queryKey: queryKeys.operatingRooms,
    queryFn: async () =>
      (await api.get<{ operatingRooms: OperatingRoom[] }>('/operating-rooms')).data.operatingRooms,
  });

  const remove = useMutation({
    mutationFn: async (room: OperatingRoom) => api.delete(`/operating-rooms/${room.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.operatingRooms });
      notify.success(t('operatingRooms.deleted'));
    },
    onSettled: () => setDeleting(null),
  });

  // Suggest the next free "Operating room N".
  function suggestion() {
    const names = new Set(rooms?.map((room) => room.name));
    let number = (rooms?.length ?? 0) + 1;
    while (names.has(t('operatingRooms.suggested', { number }))) number += 1;
    return t('operatingRooms.suggested', { number });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('operatingRooms.title')}</h2>
          <p className="text-sm text-muted">{t('operatingRooms.description')}</p>
        </div>
        <Button
          icon={<Plus className="size-4" />}
          disabled={isPending}
          onClick={() => setEditing({ mode: 'create', suggestion: suggestion() })}
        >
          {t('operatingRooms.add')}
        </Button>
      </motion.div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : rooms && rooms.length > 0 ? (
        <>
          <p className="text-xs text-muted">
            {t('operatingRooms.summary', {
              available: rooms.filter((room) => room.status === 'AVAILABLE').length,
              total: rooms.length,
            })}
          </p>
          <motion.ul
            layout
            aria-label={t('operatingRooms.title')}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {rooms.map((room) => (
                <OperatingRoomCard
                  key={room.id}
                  room={room}
                  onRename={() => setEditing({ mode: 'rename', room })}
                  onDelete={() => setDeleting(room)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      ) : (
        <motion.div {...enter(1)}>
          <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <motion.span
              className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"
              initial={{ scale: 0.8 }}
              animate={{ scale: [0.8, 1.08, 1] }}
              transition={{ duration: 0.6 }}
            >
              <HeartPulse className="size-7" aria-hidden="true" />
            </motion.span>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{t('operatingRooms.emptyTitle')}</p>
              <p className="max-w-md text-sm text-muted">{t('operatingRooms.emptyBody')}</p>
            </div>
          </Card>
        </motion.div>
      )}

      <NameDialog editing={editing} onClose={() => setEditing(null)} />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('operatingRooms.deleteTitle', { name: deleting.name }) : ''}
        description={t('operatingRooms.deleteBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {deleting ? t('operatingRooms.delete', { name: deleting.name }) : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
