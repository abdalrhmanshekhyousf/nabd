import {
  BLOOD_TYPES,
  receptionPatientSchema,
  type ReceptionPatient,
  type ReceptionPatientInput,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, RefreshCw, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { CredentialsDialog, type Credentials } from '@/components/accounts/CredentialsDialog';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Switch,
  Textarea,
} from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { generatePassword } from '@/lib/generatePassword';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type Form = {
  fullName: string;
  gender: 'MALE' | 'FEMALE' | '';
  dateOfBirth: string;
  phone: string;
  nationalId: string;
  bloodType: string;
  address: string;
  allergies: string;
  chronicConditions: string;
};

const EMPTY: Form = {
  fullName: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  nationalId: '',
  bloodType: '',
  address: '',
  allergies: '',
  chronicConditions: '',
};

/** Opening an account for a registered patient: an email and a generated password. */
function AccountDialog({
  patient,
  onClose,
  onOpened,
}: {
  patient: ReceptionPatient | null;
  onClose: () => void;
  onOpened: (credentials: Credentials) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const open = useMutation({
    mutationFn: () =>
      api.post(
        `/reception/patients/${patient!.patientId}/account`,
        { email, password },
        { skipErrorToast: true },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reception'] });
      onOpened({ name: patient!.fullName ?? '', email: email.trim().toLowerCase(), password });
      setEmail('');
      setPassword(generatePassword());
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });
  return (
    <Modal
      open={patient !== null}
      onClose={onClose}
      title={patient ? t('reception.accountFor', { name: patient.fullName }) : ''}
      size="sm"
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          open.mutate();
        }}
      >
        <Input
          label={t('reception.email')}
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField value={password} onRegenerate={() => setPassword(generatePassword())} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          loading={open.isPending}
          icon={<KeyRound className="size-4" />}
        >
          {t('reception.openAccount')}
        </Button>
      </form>
    </Modal>
  );
}

function PasswordField({ value, onRegenerate }: { value: string; onRegenerate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-end gap-2">
      <Input
        label={t('reception.password')}
        hint={t('reception.passwordHint')}
        dir="ltr"
        readOnly
        value={value}
        className="font-mono"
        containerClassName="flex-1"
      />
      <Button
        size="icon"
        variant="outline"
        aria-label={t('reception.newPassword')}
        onClick={() => {
          playSound('tap');
          onRegenerate();
        }}
      >
        <RefreshCw className="size-4" />
      </Button>
    </div>
  );
}

/** Finding a patient: by name, phone or national number; open an account for one. */
function Finder({
  search,
  setSearch,
  onAccount,
}: {
  search: string;
  setSearch: (value: string) => void;
  onAccount: (patient: ReceptionPatient) => void;
}) {
  const { t } = useTranslation();
  const needle = useDebouncedValue(search.trim(), 300);
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.receptionPatients(needle),
    queryFn: async () =>
      (
        await api.get<{ patients: ReceptionPatient[] }>('/reception/patients', {
          params: { search: needle },
        })
      ).data.patients,
  });
  return (
    <Card className="space-y-3 p-4">
      <Input
        label={t('reception.search')}
        icon={<Search />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {!data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t('reception.noneFound')}</p>
      ) : (
        <ul
          aria-label={t('reception.results')}
          className={cn('divide-y divide-border transition-opacity', isFetching && 'opacity-60')}
        >
          <AnimatePresence initial={false}>
            {data.map((patient) => (
              <motion.li
                key={patient.patientId}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={calm}
                aria-label={patientName(patient, t)}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-medium text-foreground">{patientName(patient, t)}</p>
                  <p className="text-xs text-muted">
                    {patientFacts(patient, t)}
                    {patient.phone && (
                      <>
                        {' '}
                        · <bdi dir="ltr">{patient.phone}</bdi>
                      </>
                    )}
                    {patient.nationalId && (
                      <>
                        {' '}
                        · <bdi dir="ltr">{patient.nationalId}</bdi>
                      </>
                    )}
                  </p>
                </div>
                {patient.accountEmail ? (
                  <StatusBadge tone="success">{t('reception.hasAccount')}</StatusBadge>
                ) : (
                  !patient.isAnonymous && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<KeyRound className="size-4" />}
                      onClick={() => onAccount(patient)}
                    >
                      {t('reception.openAccount')}
                    </Button>
                  )
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

// Reception (task 4.1): register a patient who walked in — their file opens
// with what reception knows, allergies included — and open their account on
// Nabd if they want one; the login is handed over once. A patient already
// registered is found by name, phone or national number instead.
export function RegisterPatientPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [withAccount, setWithAccount] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exists, setExists] = useState<{ name: string; nationalId: string } | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [search, setSearch] = useState('');
  const [accountFor, setAccountFor] = useState<ReceptionPatient | null>(null);
  const set = (change: Partial<Form>) => {
    setForm((current) => ({ ...current, ...change }));
    setErrors({});
    setExists(null);
  };

  const body = (): ReceptionPatientInput => ({
    ...form,
    gender: form.gender as 'MALE' | 'FEMALE',
    bloodType: (form.bloodType || null) as ReceptionPatientInput['bloodType'],
    account: withAccount ? { email, password } : null,
  });

  const register = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ patient: ReceptionPatient }>('/reception/patients', body(), {
          skipErrorToast: true,
        })
      ).data.patient,
    onSuccess: (patient) => {
      notify.success(t('reception.registered', { name: patient.fullName }));
      if (patient.accountEmail) {
        setCredentials({ name: patient.fullName ?? '', email: patient.accountEmail, password });
      }
      setForm(EMPTY);
      setEmail('');
      setPassword(generatePassword());
      void queryClient.invalidateQueries({ queryKey: ['reception'] });
    },
    onError: (failure) => {
      const error = describeApiError(failure);
      playSound('error');
      if (error.code === 'PATIENT_EXISTS') {
        setExists({
          name: String((error.details as { fullName?: string })?.fullName ?? ''),
          nationalId: form.nationalId,
        });
        return;
      }
      if (error.code === 'EMAIL_TAKEN') return setErrors({ email: error.message });
      setErrors({ form: error.message });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('reception.title')}</h2>
        <p className="text-sm text-muted">{t('reception.description')}</p>
      </motion.div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <motion.section {...enter(1)} aria-label={t('reception.newPatient')}>
          <Card className="p-4 sm:p-5">
            <form
              noValidate
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const parsed = receptionPatientSchema.safeParse(body());
                if (!parsed.success) {
                  const next: Record<string, string> = {};
                  for (const issue of parsed.error.issues) {
                    const key = issue.path.join('.');
                    next[
                      key === 'account.email'
                        ? 'email'
                        : key === 'account.password'
                          ? 'password'
                          : key
                    ] ??= fieldError(issue.message, t) ?? '';
                  }
                  setErrors(next);
                  return playSound('error');
                }
                register.mutate();
              }}
            >
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <UserPlus className="size-5 text-accent" aria-hidden="true" />
                {t('reception.newPatient')}
              </h3>
              <Input
                label={t('reception.fullName')}
                required
                value={form.fullName}
                error={errors.fullName}
                onChange={(e) => set({ fullName: e.target.value })}
              />
              <fieldset className="min-w-0 space-y-2">
                <legend className="mb-2 text-sm font-medium text-foreground">
                  {t('reception.gender')} <span className="text-danger">*</span>
                </legend>
                <div role="radiogroup" aria-label={t('reception.gender')} className="flex gap-2">
                  {(['MALE', 'FEMALE'] as const).map((gender) => (
                    <button
                      key={gender}
                      type="button"
                      role="radio"
                      aria-checked={form.gender === gender}
                      onClick={() => {
                        playSound('toggle');
                        set({ gender });
                      }}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                        form.gender === gender
                          ? 'border-accent bg-accent-soft font-semibold text-accent'
                          : 'border-border hover:border-accent',
                      )}
                    >
                      {t(`reception.genders.${gender}`)}
                    </button>
                  ))}
                </div>
                {errors.gender && <p className="text-sm text-danger">{errors.gender}</p>}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t('reception.dateOfBirth')}
                  type="date"
                  dir="ltr"
                  value={form.dateOfBirth}
                  error={errors.dateOfBirth}
                  onChange={(e) => set({ dateOfBirth: e.target.value })}
                />
                <Input
                  label={t('reception.phone')}
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  error={errors.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
                <Input
                  label={t('reception.nationalId')}
                  inputMode="numeric"
                  dir="ltr"
                  value={form.nationalId}
                  error={errors.nationalId}
                  onChange={(e) => set({ nationalId: e.target.value })}
                />
                <Select
                  label={t('reception.bloodType')}
                  placeholder={t('reception.unknown')}
                  options={BLOOD_TYPES.map((value) => ({ value, label: value }))}
                  value={form.bloodType}
                  onChange={(e) => set({ bloodType: e.target.value })}
                />
              </div>
              <Input
                label={t('reception.address')}
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea
                  label={t('reception.allergies')}
                  rows={2}
                  value={form.allergies}
                  onChange={(e) => set({ allergies: e.target.value })}
                />
                <Textarea
                  label={t('reception.chronic')}
                  rows={2}
                  value={form.chronicConditions}
                  onChange={(e) => set({ chronicConditions: e.target.value })}
                />
              </div>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <Switch
                  checked={withAccount}
                  onChange={setWithAccount}
                  label={t('reception.withAccount')}
                  description={t('reception.withAccountHint')}
                />
                <AnimatePresence initial={false}>
                  {withAccount && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={calm}
                      className="space-y-3 overflow-hidden"
                    >
                      <Input
                        label={t('reception.email')}
                        type="email"
                        dir="ltr"
                        value={email}
                        error={errors.email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setErrors({});
                        }}
                      />
                      <PasswordField
                        value={password}
                        onRegenerate={() => setPassword(generatePassword())}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {exists && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
                  >
                    <span>{t('reception.exists', { name: exists.name })}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSearch(exists.nationalId)}
                    >
                      {t('reception.showExisting')}
                    </Button>
                  </motion.div>
                )}
                {errors.form && (
                  <p role="alert" className="text-sm text-danger">
                    {errors.form}
                  </p>
                )}
              </AnimatePresence>
              <Button
                type="submit"
                className="w-full"
                loading={register.isPending}
                icon={<UserPlus className="size-4" />}
              >
                {t('reception.register')}
              </Button>
            </form>
          </Card>
        </motion.section>
        <motion.section {...enter(2)} aria-label={t('reception.find')} className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('reception.find')}</h3>
          <Finder search={search} setSearch={setSearch} onAccount={setAccountFor} />
        </motion.section>
      </div>
      <AccountDialog
        patient={accountFor}
        onClose={() => setAccountFor(null)}
        onOpened={(handOver) => {
          setAccountFor(null);
          setCredentials(handOver);
        }}
      />
      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
        forPatient
      />
    </div>
  );
}
