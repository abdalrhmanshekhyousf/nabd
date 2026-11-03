import { zodResolver } from '@hookform/resolvers/zod';
import {
  createStaffSchema,
  RADIOLOGY_MODALITIES,
  ROLES_NEEDING_DEPARTMENT,
  ROLES_WITH_MANY_DEPARTMENTS,
  STAFF_ROLES,
  updateStaffSchema,
  type DoctorStatus,
  type RadiologyModality,
  type Role,
  type StaffRole,
  type UpdateStaffData,
  type UpdateStaffInput,
  type ValidationKey,
} from '@nabd/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Banknote,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Network,
  Pencil,
  Phone,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import { DOCTOR_STATUS_TONE } from '@/components/doctor/doctorStatusStyles';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  StatusBadge,
  Switch,
  Table,
  type StatusTone,
  type TableColumn,
} from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { generatePassword } from '@/lib/generatePassword';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  department: Pick<Department, 'id' | 'name' | 'code'> | null;
  salary: number;
  radiologyModality: RadiologyModality | null;
  specialty: string | null;
  /** Only cleaners: every department they cover (task 1.29). */
  cleanerDepartments: Pick<Department, 'id' | 'name' | 'code'>[];
  /** Only doctors: available, busy or on leave, live (task 2.5). */
  doctorStatus: DoctorStatus | null;
};

type Credentials = { name: string; email: string; password: string };
type DialogTarget = { mode: 'create' } | { mode: 'edit'; member: StaffMember } | null;

const ROLE_TONE: Partial<Record<Role, StatusTone>> = {
  ADMIN: 'info',
  DOCTOR: 'success',
  NURSE: 'success',
};

/** Validation messages are translation keys; server messages arrive translated. */
function errorText(message: string | undefined, t: (key: ValidationKey) => string) {
  if (!message) return undefined;
  return message.startsWith('validation.') ? t(message as ValidationKey) : message;
}

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold text-muted">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Appears and disappears smoothly when the chosen role needs (or drops) a field. */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={calm}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function blankValues(): UpdateStaffInput {
  return {
    fullName: '',
    phone: '',
    role: '' as StaffRole,
    departmentId: null,
    specialty: '',
    radiologyModality: null,
    salary: 0,
    email: '',
    password: '',
    isActive: true,
  };
}

function memberValues(member: StaffMember): UpdateStaffInput {
  return {
    fullName: member.fullName,
    phone: member.phone ?? '',
    role: member.role as StaffRole,
    departmentId: member.department?.id ?? null,
    specialty: member.specialty ?? '',
    radiologyModality: member.radiologyModality,
    salary: member.salary,
    email: member.email,
    password: '',
    isActive: member.isActive,
  };
}

/**
 * The form inside the add/edit dialog. It only exists while the dialog is open,
 * so each opening starts from fresh values (blank, or the employee's).
 */
function StaffForm({
  member,
  departments,
  onCancel,
  onSaved,
}: {
  member: StaffMember | null;
  departments: Department[];
  onCancel: () => void;
  onSaved: (credentials: Credentials | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const editing = member !== null;

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateStaffInput, unknown, UpdateStaffData>({
    // Adding requires a password; editing keeps the current one when left empty.
    resolver: zodResolver(editing ? updateStaffSchema : createStaffSchema) as Resolver<
      UpdateStaffInput,
      unknown,
      UpdateStaffData
    >,
    defaultValues: member ? memberValues(member) : blankValues(),
  });

  const role = useWatch({ control, name: 'role' });
  const needsDepartment = ROLES_NEEDING_DEPARTMENT.includes(role);

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        if (member) {
          await api.patch(`/staff/${member.id}`, values, { skipErrorToast: true });
          notify.success(t('staff.saved', { name: values.fullName }));
        } else {
          await api.post('/staff', values, { skipErrorToast: true });
          notify.success(t('staff.created', { name: values.fullName }));
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['staff'] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
        ]);
        // A new account, or a new password, is handed over with the credentials card.
        onSaved(
          values.password
            ? { name: values.fullName, email: values.email, password: values.password }
            : null,
        );
      } catch (error) {
        const { code, message } = describeApiError(error);
        setError(code === 'EMAIL_TAKEN' ? 'email' : 'fullName', { message });
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  const departmentOptions = departments.map((department) => ({
    value: department.id,
    label: departmentLabel(department, t),
  }));

  return (
    <form id="staff-form" noValidate onSubmit={onSubmit} className="space-y-6">
      <Section title={t('staff.sectionPersonal')}>
        <Input
          label={t('staff.fullName')}
          icon={<UserRound />}
          required
          error={errorText(errors.fullName?.message, t)}
          {...register('fullName')}
        />
        <Input
          label={`${t('staff.phone')} (${t('staff.optional')})`}
          icon={<Phone />}
          type="tel"
          inputMode="tel"
          dir="ltr"
          error={errorText(errors.phone?.message, t)}
          {...register('phone')}
        />
      </Section>

      <Section title={t('staff.sectionJob')}>
        <Select
          label={t('staff.role')}
          placeholder={t('staff.chooseRole')}
          required
          options={STAFF_ROLES.map((value) => ({ value, label: t(`roles.${value}`) }))}
          error={errorText(errors.role?.message, t)}
          {...register('role')}
        />
        {ROLES_WITH_MANY_DEPARTMENTS.includes(role) ? (
          // Cleaners cover several departments, chosen on the assignments page.
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t('staff.department')}</span>
            <Link
              to="/admin/assignments"
              className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Network className="size-4 shrink-0" aria-hidden="true" />
              {t('staff.cleanerHint')}
            </Link>
          </div>
        ) : (
          <Select
            label={
              needsDepartment
                ? t('staff.department')
                : `${t('staff.department')} (${t('staff.optional')})`
            }
            placeholder={needsDepartment ? t('staff.chooseDepartment') : t('staff.noDepartment')}
            required={needsDepartment}
            options={departmentOptions}
            error={errorText(errors.departmentId?.message, t)}
            hint={departments.length === 0 ? t('staff.noDepartmentsHint') : undefined}
            {...register('departmentId', { setValueAs: emptyToNull })}
          />
        )}
        <div className="sm:col-span-2">
          <Reveal show={role === 'DOCTOR'}>
            <Input
              label={t('staff.specialty')}
              placeholder={t('staff.specialtyPlaceholder')}
              icon={<Stethoscope />}
              required
              error={errorText(errors.specialty?.message, t)}
              {...register('specialty')}
            />
          </Reveal>
          <Reveal show={role === 'RADIOLOGIST'}>
            <Select
              label={t('staff.modality')}
              placeholder={t('staff.chooseModality')}
              required
              options={RADIOLOGY_MODALITIES.map((value) => ({
                value,
                label: t(`modalities.${value}`),
              }))}
              error={errorText(errors.radiologyModality?.message, t)}
              {...register('radiologyModality', { setValueAs: emptyToNull })}
            />
          </Reveal>
        </div>
        <Input
          label={t('staff.salary')}
          icon={<Banknote />}
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          dir="ltr"
          lang={i18n.language}
          error={errorText(errors.salary?.message, t)}
          {...register('salary', { valueAsNumber: true })}
        />
      </Section>

      <Section title={t('staff.sectionLogin')}>
        <Input
          label={t('staff.email')}
          icon={<Mail />}
          type="email"
          autoComplete="off"
          dir="ltr"
          required
          error={errorText(errors.email?.message, t)}
          {...register('email')}
        />
        <div className="space-y-2">
          <Input
            label={editing ? t('staff.newPassword') : t('staff.password')}
            hint={editing ? t('staff.newPasswordHint') : t('register.passwordHint')}
            icon={<Lock />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            dir="ltr"
            required={!editing}
            error={errorText(errors.password?.message, t)}
            end={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                aria-pressed={showPassword}
                className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register('password')}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<KeyRound className="size-4" />}
            onClick={() => {
              setValue('password', generatePassword(), { shouldValidate: true });
              setShowPassword(true);
            }}
          >
            {t('staff.generate')}
          </Button>
        </div>
        {editing && (
          <div className="sm:col-span-2">
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  label={t('staff.active')}
                  description={t('staff.activeHint')}
                />
              )}
            />
          </div>
        )}
      </Section>

      {/* Actions stay visible at the bottom while the form scrolls. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          loading={isSubmitting}
          icon={editing ? <Check className="size-4" /> : <UserPlus className="size-4" />}
        >
          {editing ? t('staff.save') : t('staff.create')}
        </Button>
      </div>
    </form>
  );
}

function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p dir="ltr" className="truncate text-start font-mono text-sm text-foreground">
          {value}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        aria-label={copyLabel}
        icon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            // Clipboard blocked (permissions, insecure origin): say so instead of
            // pretending it worked; the value stays visible to copy by hand.
            notify.error(t('staff.copyFailed'));
            return;
          }
          setCopied(true);
          playSound('success');
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t('staff.copied') : copyLabel}
      </Button>
    </div>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: Credentials | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={credentials !== null}
      onClose={onClose}
      title={credentials ? t('staff.credentialsTitle', { name: credentials.name }) : ''}
      description={t('staff.credentialsBody')}
      size="sm"
      footer={<Button onClick={onClose}>{t('staff.done')}</Button>}
    >
      {credentials && (
        <div className="space-y-2">
          <CopyRow
            label={t('staff.email')}
            value={credentials.email}
            copyLabel={t('staff.copyEmail')}
          />
          <CopyRow
            label={t('staff.password')}
            value={credentials.password}
            copyLabel={t('staff.copyPassword')}
          />
        </div>
      )}
    </Modal>
  );
}

/** Search box, role and department filters, kept in the URL. */
function StaffFilters({
  departments,
  search,
  role,
  departmentId,
  onChange,
}: {
  departments: Department[];
  search: string;
  role: string;
  departmentId: string;
  onChange: (changes: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(search);

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    if (text.trim() === search) return;
    const timer = window.setTimeout(() => onChange({ search: text.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [text, search, onChange]);

  const active = Boolean(search || role || departmentId);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
      <Input
        label={t('staff.searchLabel')}
        placeholder={t('staff.search')}
        icon={<Search />}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Select
        label={t('staff.filterRole')}
        placeholder={t('staff.allRoles')}
        options={STAFF_ROLES.map((value) => ({ value, label: t(`roles.${value}`) }))}
        value={role}
        onChange={(event) => onChange({ role: event.target.value })}
      />
      <Select
        label={t('staff.filterDepartment')}
        placeholder={t('staff.allDepartments')}
        options={departments.map((department) => ({
          value: department.id,
          label: departmentLabel(department, t),
        }))}
        value={departmentId}
        onChange={(event) => onChange({ departmentId: event.target.value })}
      />
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <Button
              variant="ghost"
              icon={<X className="size-4" />}
              onClick={() => {
                setText('');
                onChange({ search: '', role: '', departmentId: '' });
              }}
            >
              {t('staff.clearFilters')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Admin: the hospital's employees: add (task 1.27), search, filter, edit and
// remove (task 1.28).
export function StaffPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<DialogTarget>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const filter = {
    search: params.get('search') ?? '',
    role: params.get('role') ?? '',
    departmentId: params.get('department') ?? '',
  };
  const filtering = Boolean(filter.search || filter.role || filter.departmentId);

  const { data: staff, isPending } = useQuery({
    queryKey: queryKeys.staff(filter),
    queryFn: async () =>
      (
        await api.get<{ staff: StaffMember[] }>('/staff', {
          params: {
            search: filter.search || undefined,
            role: filter.role || undefined,
            departmentId: filter.departmentId || undefined,
          },
        })
      ).data.staff,
    // Keep showing the last results while new ones load, instead of flashing.
    placeholderData: keepPreviousData,
  });
  const { data: departments = [] } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
  });

  function updateFilter(changes: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          const param = key === 'departmentId' ? 'department' : key;
          if (value) next.set(param, value);
          else next.delete(param);
        }
        return next;
      },
      { replace: true },
    );
  }

  const remove = useMutation({
    mutationFn: async (member: StaffMember) => api.delete(`/staff/${member.id}`),
    onSuccess: async (_result, member) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
      ]);
      notify.success(t('staff.deleted', { name: member.fullName }));
    },
    onSettled: () => setDeleting(null),
  });

  const money = new Intl.NumberFormat(i18n.language);
  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'name',
      header: t('staff.colName'),
      cell: (member) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {member.fullName}
            {!member.isActive && (
              <StatusBadge tone="danger" dot={false}>
                {t('staff.suspended')}
              </StatusBadge>
            )}
          </p>
          <p dir="ltr" className="truncate text-start text-xs text-muted">
            {member.email}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('staff.colRole'),
      cell: (member) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={ROLE_TONE[member.role] ?? 'neutral'} dot={false}>
            {t(`roles.${member.role}`)}
            {member.radiologyModality ? ` · ${t(`modalities.${member.radiologyModality}`)}` : ''}
            {member.specialty ? ` · ${member.specialty}` : ''}
          </StatusBadge>
          {member.doctorStatus && (
            <StatusBadge tone={DOCTOR_STATUS_TONE[member.doctorStatus]}>
              {t(`doctorStatus.${member.doctorStatus}`)}
            </StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: 'department',
      header: t('staff.colDepartment'),
      cell: (member) => {
        const covered = member.department ? [member.department] : member.cleanerDepartments;
        return covered.length > 0
          ? covered.map((department) => departmentLabel(department, t)).join('، ')
          : '—';
      },
    },
    {
      key: 'salary',
      header: t('staff.colSalary'),
      cell: (member) => <span dir="ltr">{money.format(member.salary)}</span>,
    },
    {
      key: 'actions',
      header: t('staff.colActions'),
      className: 'w-24',
      // The admin's own account is managed elsewhere.
      cell: (member) =>
        member.role === 'ADMIN' ? null : (
          <div className="flex justify-end gap-1 md:justify-start">
            <Button
              size="icon"
              variant="ghost"
              className="size-9 text-muted hover:text-foreground"
              aria-label={t('staff.edit', { name: member.fullName })}
              onClick={() => setTarget({ mode: 'edit', member })}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
              aria-label={t('staff.delete', { name: member.fullName })}
              onClick={() => setDeleting(member)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
    },
  ];

  const editingMember = target?.mode === 'edit' ? target.member : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('staff.title')}</h2>
          <p className="text-sm text-muted">{t('staff.description')}</p>
        </div>
        <Button
          icon={<UserPlus className="size-4" />}
          onClick={() => setTarget({ mode: 'create' })}
        >
          {t('staff.add')}
        </Button>
      </motion.div>

      <motion.div {...enter(1)}>
        <StaffFilters
          departments={departments}
          search={filter.search}
          role={filter.role}
          departmentId={filter.departmentId}
          onChange={updateFilter}
        />
      </motion.div>

      <motion.div {...enter(2)} className="space-y-3">
        {staff && staff.length > 0 && (
          <p className="text-xs text-muted" aria-live="polite">
            {filtering
              ? t('staff.results', { count: staff.length })
              : t('staff.count', { count: staff.length })}
          </p>
        )}
        {!isPending && staff?.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              {filtering ? (
                <Search className="size-7" aria-hidden="true" />
              ) : (
                <Users className="size-7" aria-hidden="true" />
              )}
            </span>
            <p className="font-semibold text-foreground">
              {filtering ? t('staff.noResults') : t('staff.emptyTitle')}
            </p>
            <p className="text-sm text-muted">
              {filtering ? t('staff.noResultsHint') : t('staff.emptyBody')}
            </p>
          </Card>
        ) : (
          <Table
            caption={t('staff.caption')}
            columns={columns}
            rows={staff ?? []}
            loading={isPending}
            getRowKey={(member) => member.id}
          />
        )}
      </motion.div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={
          editingMember
            ? t('staff.editTitle', { name: editingMember.fullName })
            : t('staff.addTitle')
        }
        size="lg"
      >
        {target && (
          <StaffForm
            member={editingMember}
            departments={departments}
            onCancel={() => setTarget(null)}
            onSaved={(handOver) => {
              setTarget(null);
              if (handOver) setCredentials(handOver);
            }}
          />
        )}
      </Modal>

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('staff.deleteTitle', { name: deleting.fullName }) : ''}
        description={t('staff.deleteBody')}
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
              {deleting ? t('staff.delete', { name: deleting.fullName }) : ''}
            </Button>
          </>
        }
      />
    </div>
  );
}
