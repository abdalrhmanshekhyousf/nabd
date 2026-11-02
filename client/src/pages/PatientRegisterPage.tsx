import { zodResolver } from '@hookform/resolvers/zod';
import {
  GENDERS,
  registerPatientFormSchema,
  type RegisterPatientFormData,
  type RegisterPatientFormInput,
  type ValidationKey,
} from '@nabd/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import type { AuthResponse } from '@/app/session';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, Input, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { startSession } from '@/lib/session';
import { playSound } from '@/lib/sound';

type PublicHospital = { id: string; name: string; address: string };

const STEPS: {
  titleKey: 'patientRegister.stepHospital' | 'patientRegister.stepDetails';
  fields: FieldPath<RegisterPatientFormInput>[];
}[] = [
  { titleKey: 'patientRegister.stepHospital', fields: ['hospitalId'] },
  {
    titleKey: 'patientRegister.stepDetails',
    fields: ['fullName', 'phone', 'gender', 'dateOfBirth', 'email', 'password', 'confirmPassword'],
  },
];

/** Today as YYYY-MM-DD, the latest date of birth the date picker offers. */
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** First letter of the hospital's name, standing in for its logo before sign-in. */
function Initial({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold transition-colors',
        active ? 'bg-accent text-white' : 'bg-accent-soft text-accent',
      )}
    >
      {active ? <Check className="size-5" /> : name.trim().charAt(0)}
    </span>
  );
}

// Task 1.30: a patient picks their hospital, opens an account there and lands on
// the patient area already signed in.
export function PatientRegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<PublicHospital | null>(null);

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const { data: hospitals, isPending } = useQuery({
    queryKey: queryKeys.publicHospitals(search),
    queryFn: async () =>
      (
        await api.get<{ hospitals: PublicHospital[] }>('/public/hospitals', {
          params: { search: search || undefined },
          skipAuthRefresh: true,
        })
      ).data.hospitals,
    placeholderData: keepPreviousData,
  });

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPatientFormInput, unknown, RegisterPatientFormData>({
    resolver: zodResolver(registerPatientFormSchema),
    defaultValues: {
      hospitalId: '',
      fullName: '',
      phone: '',
      gender: '' as RegisterPatientFormInput['gender'],
      dateOfBirth: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const fieldError = (message?: string) => (message ? t(message as ValidationKey) : undefined);

  function choose(hospital: PublicHospital) {
    setChosen(hospital);
    setValue('hospitalId', hospital.id, { shouldValidate: true });
    playSound('toggle');
  }

  async function next() {
    if (await trigger(STEPS[0].fields)) {
      playSound('toggle');
      setStep(1);
    } else {
      playSound('error');
    }
  }

  const onSubmit = handleSubmit(
    async ({ confirmPassword: _confirm, ...patient }) => {
      setServerError(null);
      try {
        const { data } = await api.post<AuthResponse>('/auth/register/patient', patient, {
          skipAuthRefresh: true,
          skipErrorToast: true,
        });
        await startSession(data);
        notify.success(t('patientRegister.created', { name: data.user.hospital.name }));
        void navigate('/patient', { replace: true });
      } catch (error) {
        setServerError(describeApiError(error).message);
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <motion.h1 {...enter(0)} className="text-2xl font-bold text-foreground sm:text-3xl">
            {t('patientRegister.title')}
          </motion.h1>
          <motion.p {...enter(1)} className="text-sm text-muted">
            {t('patientRegister.subtitle')}
          </motion.p>
        </div>

        {/* Progress */}
        <motion.div {...enter(2)} className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-accent">{t(STEPS[step].titleKey)}</span>
            <span className="text-muted">
              {t('register.step', { current: step + 1, total: STEPS.length })}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-label={t('register.step', { current: step + 1, total: STEPS.length })}
          >
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={false}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={calm}
            />
          </div>
        </motion.div>

        <AnimatePresence>
          {serverError && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {serverError}
            </motion.div>
          )}
        </AnimatePresence>

        <form noValidate onSubmit={onSubmit}>
          <AnimatePresence mode="wait" initial={false}>
            {step === 0 ? (
              <motion.div
                key="hospital"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={calm}
                className="space-y-4"
              >
                <Input
                  label={t('patientRegister.search')}
                  placeholder={t('patientRegister.searchPlaceholder')}
                  icon={<Search />}
                  type="search"
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <fieldset className="min-w-0 space-y-2">
                  <legend className="sr-only">{t('patientRegister.hospitals')}</legend>
                  <div
                    role="radiogroup"
                    aria-label={t('patientRegister.hospitals')}
                    aria-invalid={errors.hospitalId ? true : undefined}
                    className="max-h-72 space-y-2 overflow-y-auto p-0.5"
                  >
                    {isPending ? (
                      <div className="flex justify-center py-8">
                        <Spinner />
                      </div>
                    ) : hospitals?.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                        {t('patientRegister.noHospitals')}
                      </p>
                    ) : (
                      hospitals?.map((hospital) => {
                        const active = chosen?.id === hospital.id;
                        return (
                          <motion.button
                            key={hospital.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            layout
                            whileTap={{ scale: 0.98 }}
                            onClick={() => choose(hospital)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                              active
                                ? 'border-accent bg-accent-soft/60'
                                : 'border-border bg-surface hover:border-accent/50',
                            )}
                          >
                            <Initial name={hospital.name} active={active} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {hospital.name}
                              </span>
                              <span className="flex items-center gap-1 truncate text-xs text-muted">
                                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                                {hospital.address}
                              </span>
                            </span>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                  <AnimatePresence>
                    {errors.hospitalId && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-xs text-danger"
                      >
                        {t('patientRegister.chooseHospital')}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </fieldset>
                <p className="text-xs text-muted">{t('patientRegister.separateAccounts')}</p>
                <Button
                  size="lg"
                  fullWidth
                  onClick={() => void next()}
                  icon={<ArrowRight className="size-4 rtl:-scale-x-100" />}
                >
                  {t('register.next')}
                </Button>
              </motion.div>
            ) : (
              <motion.fieldset
                key="details"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={calm}
                className="space-y-4"
              >
                <legend className="sr-only">{t('patientRegister.stepDetails')}</legend>
                {chosen && (
                  <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-3">
                    <Initial name={chosen.name} active={false} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">{t('patientRegister.chosen')}</p>
                      <p className="truncate font-medium text-foreground">{chosen.name}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setStep(0)}>
                      {t('patientRegister.change')}
                    </Button>
                  </div>
                )}
                <Input
                  label={t('patientRegister.fullName')}
                  icon={<UserRound />}
                  required
                  autoFocus
                  autoComplete="name"
                  error={fieldError(errors.fullName?.message)}
                  {...register('fullName')}
                />
                <Input
                  label={t('patientRegister.phone')}
                  icon={<Phone />}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  required
                  error={fieldError(errors.phone?.message)}
                  {...register('phone')}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-sm font-medium text-foreground">
                      {t('patientRegister.gender')}
                      <span className="ms-0.5 text-danger" aria-hidden="true">
                        *
                      </span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {GENDERS.map((gender) => (
                        <label key={gender} className="relative">
                          <input
                            type="radio"
                            value={gender}
                            className="peer sr-only"
                            {...register('gender')}
                          />
                          <span className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-input bg-surface text-sm text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring hover:border-accent/50">
                            {t(`patientRegister.${gender}`)}
                          </span>
                        </label>
                      ))}
                    </div>
                    {errors.gender && (
                      <p role="alert" className="text-xs text-danger">
                        {fieldError(errors.gender.message)}
                      </p>
                    )}
                  </fieldset>
                  <Input
                    label={`${t('patientRegister.dateOfBirth')} (${t('register.optional')})`}
                    icon={<CalendarDays />}
                    type="date"
                    max={today()}
                    min="1900-01-01"
                    dir="ltr"
                    error={fieldError(errors.dateOfBirth?.message)}
                    {...register('dateOfBirth')}
                  />
                </div>
                <Input
                  label={t('patientRegister.email')}
                  icon={<Mail />}
                  type="email"
                  autoComplete="username"
                  dir="ltr"
                  required
                  error={fieldError(errors.email?.message)}
                  {...register('email')}
                />
                <Input
                  label={t('register.password')}
                  hint={t('register.passwordHint')}
                  icon={<Lock />}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  error={fieldError(errors.password?.message)}
                  {...register('password')}
                />
                <Input
                  label={t('register.confirmPassword')}
                  icon={<Lock />}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  error={fieldError(errors.confirmPassword?.message)}
                  {...register('confirmPassword')}
                />
                {/* Stacked on narrow phones, side by side from sm up */}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setStep(0)}
                    icon={<ArrowLeft className="size-4 rtl:-scale-x-100" />}
                  >
                    {t('register.back')}
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={isSubmitting}
                    className="sm:flex-1"
                  >
                    {t('patientRegister.submit')}
                  </Button>
                </div>
              </motion.fieldset>
            )}
          </AnimatePresence>
        </form>

        <p className="text-center text-sm text-muted">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t('register.signIn')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
