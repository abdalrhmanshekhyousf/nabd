import { zodResolver } from '@hookform/resolvers/zod';
import { departmentSchema, type DepartmentInput, type ValidationKey } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, DoorOpen, Pencil, Plus, Trash2, Users, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { DepartmentIcon } from '@/components/departments/DepartmentIcon';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import { Button, Card, Input, Modal, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calmSpring, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

type Editing = { mode: 'create' } | { mode: 'rename'; department: Department } | null;

/** Validation messages are translation keys; server messages arrive translated. */
function errorText(message: string | undefined, t: (key: ValidationKey) => string) {
  if (!message) return undefined;
  return message.startsWith('validation.') ? t(message as ValidationKey) : message;
}

function DepartmentForm({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const renaming = editing?.mode === 'rename' ? editing.department : null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentInput>({ resolver: zodResolver(departmentSchema) });

  useEffect(() => {
    if (editing) reset({ name: renaming?.name ?? '' });
  }, [editing, renaming, reset]);

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      if (renaming) {
        await api.patch(`/departments/${renaming.id}`, { name }, { skipErrorToast: true });
        notify.success(t('departments.renamed'));
      } else {
        await api.post('/departments', { name }, { skipErrorToast: true });
        notify.success(t('departments.created', { name }));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.departments });
      onClose();
    } catch (error) {
      // e.g. "a department with this name already exists", next to the field.
      setError('name', { message: describeApiError(error).message });
    }
  });

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={renaming ? t('departments.renameTitle') : t('departments.addTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="department-form" loading={isSubmitting}>
            {renaming ? t('common.save') : t('departments.create')}
          </Button>
        </>
      }
    >
      <form id="department-form" noValidate onSubmit={onSubmit}>
        <Input
          label={t('departments.name')}
          placeholder={t('departments.namePlaceholder')}
          icon={<Building2 />}
          required
          error={errorText(errors.name?.message, t)}
          {...register('name')}
        />
      </form>
    </Modal>
  );
}

function DepartmentCard({
  department,
  onRename,
  onDelete,
}: {
  department: Department;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const label = departmentLabel(department, t);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={calmSpring}
    >
      <Card className="group flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-lifted">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform group-hover:scale-105">
          <DepartmentIcon code={department.code} className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">{label}</h3>
            <StatusBadge tone={department.code ? 'info' : 'neutral'} dot={false}>
              {department.code ? t('departments.builtIn') : t('departments.custom')}
            </StatusBadge>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <DoorOpen className="size-3.5" aria-hidden="true" />
              {t('departments.rooms', { count: department.roomCount })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {t('departments.staff', { count: department.staffCount })}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {!department.code && (
            <Button
              size="icon"
              variant="ghost"
              className="size-9 text-muted hover:text-foreground"
              aria-label={t('departments.rename', { name: label })}
              onClick={onRename}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
            aria-label={t('departments.delete', { name: label })}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </Card>
    </motion.li>
  );
}

// Admin: the hospital's departments (task 1.24).
export function DepartmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const { data: departments, isPending } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
  });

  const missingDefaults = 12 - (departments?.filter((d) => d.code).length ?? 0);

  const addDefaults = useMutation({
    mutationFn: async () =>
      (await api.post<{ added: number; departments: Department[] }>('/departments/defaults')).data,
    onSuccess: ({ added, departments: all }) => {
      queryClient.setQueryData(queryKeys.departments, all);
      notify.success(t('departments.defaultsAdded', { count: added }));
    },
  });

  const remove = useMutation({
    mutationFn: async (department: Department) => api.delete(`/departments/${department.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments });
      notify.success(t('departments.deleted'));
    },
    onSettled: () => setDeleting(null),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('departments.title')}</h2>
          <p className="text-sm text-muted">{t('departments.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {departments && missingDefaults > 0 && (
            <Button
              variant="outline"
              icon={<Wand2 className="size-4" />}
              loading={addDefaults.isPending}
              onClick={() => addDefaults.mutate()}
            >
              {t('departments.addDefaults')}
            </Button>
          )}
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ mode: 'create' })}>
            {t('departments.add')}
          </Button>
        </div>
      </motion.div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : departments && departments.length > 0 ? (
        <>
          <p className="text-xs text-muted">
            {t('departments.summary', { count: departments.length })}
          </p>
          <motion.ul
            layout
            aria-label={t('departments.title')}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {departments.map((department) => (
                <DepartmentCard
                  key={department.id}
                  department={department}
                  onRename={() => setEditing({ mode: 'rename', department })}
                  onDelete={() => setDeleting(department)}
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
              initial={{ rotate: -10, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={calmSpring}
            >
              <Building2 className="size-7" aria-hidden="true" />
            </motion.span>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{t('departments.emptyTitle')}</p>
              <p className="max-w-md text-sm text-muted">{t('departments.emptyBody')}</p>
            </div>
          </Card>
        </motion.div>
      )}

      <DepartmentForm editing={editing} onClose={() => setEditing(null)} />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('departments.deleteTitle', { name: departmentLabel(deleting, t) }) : ''}
        description={t('departments.deleteBody')}
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
              {deleting ? t('departments.delete', { name: departmentLabel(deleting, t) }) : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
