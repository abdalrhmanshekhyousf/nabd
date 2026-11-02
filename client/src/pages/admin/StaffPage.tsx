import { zodResolver } from '@hookform/resolvers/zod';
import {
  createStaffSchema,
  RADIOLOGY_MODALITIES,
  ROLES_NEEDING_DEPARTMENT,
  STAFF_ROLES,
  type CreateStaffData,
  type CreateStaffInput,
  type RadiologyModality,
  type Role,
  type ValidationKey,
} from '@nabd/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Phone,
  Stethoscope,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  StatusBadge,
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
};

type Credentials = { name: string; email: string; password: string };

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

function AddStaffDialog({
  open,
  departments,
  onClose,
  onCreated,
}: {
  open: boolean;
  departments: Department[];
  onClose: () => void;
  onCreated: (credentials: Credentials) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput, unknown, CreateStaffData>({
    resolver: zodResolver(createStaffSchema),
  });

  useEffect(() => {
    if (open) {
      reset({
        fullName: '',
        phone: '',
        role: '' as CreateStaffInput['role'],
        departmentId: null,
        specialty: '',
        radiologyModality: null,
        salary: 0,
        email: '',
        password: '',
      });
    }
  }, [open, reset]);

  const role = useWatch({ control, name: 'role' });

  // The password goes back to hidden whenever the dialog closes.
  function close() {
    setShowPassword(false);
    onClose();
  }
  const needsDepartment = ROLES_NEEDING_DEPARTMENT.includes(role);

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        await api.post('/staff', values, { skipErrorToast: true });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.staff }),
          queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
        ]);
        notify.success(t('staff.created', { name: values.fullName }));
        setShowPassword(false);
        onCreated({ name: values.fullName, email: values.email, password: values.password });
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
    <Modal
      open={open}
      onClose={close}
      title={t('staff.addTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="staff-form"
            loading={isSubmitting}
            icon={<UserPlus className="size-4" />}
          >
            {t('staff.create')}
          </Button>
        </>
      }
    >
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
              label={t('staff.password')}
              hint={t('register.passwordHint')}
              icon={<Lock />}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              dir="ltr"
              required
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
        </Section>
      </form>
    </Modal>
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

// Admin: the hospital's employees (task 1.27: adding them; search, filters, editing
// and removal come in task 1.28).
export function StaffPage() {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const { data: staff, isPending } = useQuery({
    queryKey: queryKeys.staff,
    queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/staff')).data.staff,
  });
  const { data: departments = [] } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
  });

  const money = new Intl.NumberFormat(i18n.language);
  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'name',
      header: t('staff.colName'),
      cell: (member) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{member.fullName}</p>
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
        <StatusBadge tone={ROLE_TONE[member.role] ?? 'neutral'} dot={false}>
          {t(`roles.${member.role}`)}
          {member.radiologyModality ? ` · ${t(`modalities.${member.radiologyModality}`)}` : ''}
          {member.specialty ? ` · ${member.specialty}` : ''}
        </StatusBadge>
      ),
    },
    {
      key: 'department',
      header: t('staff.colDepartment'),
      cell: (member) => (member.department ? departmentLabel(member.department, t) : '—'),
    },
    {
      key: 'salary',
      header: t('staff.colSalary'),
      cell: (member) => <span dir="ltr">{money.format(member.salary)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('staff.title')}</h2>
          <p className="text-sm text-muted">{t('staff.description')}</p>
        </div>
        <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
          {t('staff.add')}
        </Button>
      </motion.div>

      <motion.div {...enter(1)} className="space-y-3">
        {staff && staff.length > 0 && (
          <p className="text-xs text-muted">{t('staff.count', { count: staff.length })}</p>
        )}
        {!isPending && staff?.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Users className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold text-foreground">{t('staff.emptyTitle')}</p>
            <p className="text-sm text-muted">{t('staff.emptyBody')}</p>
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

      <AddStaffDialog
        open={adding}
        departments={departments}
        onClose={() => setAdding(false)}
        onCreated={(created) => {
          setAdding(false);
          setCredentials(created);
        }}
      />
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}
