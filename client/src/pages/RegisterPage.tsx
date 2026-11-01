import { zodResolver } from '@hookform/resolvers/zod';
import {
  registerHospitalFormSchema,
  type RegisterHospitalFormInput,
  type ValidationKey,
} from '@nabd/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleAlert,
  Lock,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import type { AuthResponse } from '@/app/session';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, Input } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { startSession } from '@/lib/session';
import { playSound } from '@/lib/sound';

type FormValues = RegisterHospitalFormInput;

const STEPS: {
  titleKey: 'register.stepHospital' | 'register.stepAdmin';
  fields: FieldPath<FormValues>[];
}[] = [
  {
    titleKey: 'register.stepHospital',
    fields: ['hospital.name', 'hospital.address', 'hospital.phone', 'hospital.email'],
  },
  {
    titleKey: 'register.stepAdmin',
    fields: ['admin.fullName', 'admin.email', 'admin.password', 'admin.confirmPassword'],
  },
];

// Task 1.22: a new administrator creates their hospital and account in two steps,
// then lands on the admin dashboard already signed in.
export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, z.output<typeof registerHospitalFormSchema>>({
    resolver: zodResolver(registerHospitalFormSchema),
    defaultValues: {
      hospital: { name: '', address: '', phone: '', email: '' },
      admin: { fullName: '', email: '', password: '', confirmPassword: '' },
    },
  });

  const fieldError = (message?: string) => (message ? t(message as ValidationKey) : undefined);

  async function next() {
    if (await trigger(STEPS[0].fields)) {
      playSound('toggle');
      setStep(1);
    } else {
      playSound('error');
    }
  }

  const onSubmit = handleSubmit(
    async ({ hospital, admin }) => {
      setServerError(null);
      try {
        const { data } = await api.post<AuthResponse>(
          '/auth/register',
          {
            hospital,
            admin: { fullName: admin.fullName, email: admin.email, password: admin.password },
          },
          { skipAuthRefresh: true, skipErrorToast: true },
        );
        await startSession(data);
        notify.success(t('register.created', { name: data.user.hospital.name }));
        void navigate('/admin', { replace: true });
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
            {t('register.title')}
          </motion.h1>
          <motion.p {...enter(1)} className="text-sm text-muted">
            {t('register.subtitle')}
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
              <motion.fieldset
                key="hospital"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={calm}
                className="space-y-4"
              >
                <legend className="sr-only">{t('register.stepHospital')}</legend>
                <Input
                  label={t('register.hospitalName')}
                  icon={<Building2 />}
                  required
                  autoFocus
                  error={fieldError(errors.hospital?.name?.message)}
                  {...register('hospital.name')}
                />
                <Input
                  label={t('register.address')}
                  icon={<MapPin />}
                  required
                  error={fieldError(errors.hospital?.address?.message)}
                  {...register('hospital.address')}
                />
                <Input
                  label={t('register.phone')}
                  icon={<Phone />}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  required
                  error={fieldError(errors.hospital?.phone?.message)}
                  {...register('hospital.phone')}
                />
                <Input
                  label={`${t('register.hospitalEmail')} (${t('register.optional')})`}
                  icon={<Mail />}
                  type="email"
                  dir="ltr"
                  error={fieldError(errors.hospital?.email?.message)}
                  {...register('hospital.email')}
                />
                <Button
                  size="lg"
                  fullWidth
                  onClick={() => void next()}
                  icon={<ArrowRight className="size-4 rtl:-scale-x-100" />}
                >
                  {t('register.next')}
                </Button>
              </motion.fieldset>
            ) : (
              <motion.fieldset
                key="admin"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={calm}
                className="space-y-4"
              >
                <legend className="sr-only">{t('register.stepAdmin')}</legend>
                <Input
                  label={t('register.adminName')}
                  icon={<UserRound />}
                  required
                  autoFocus
                  autoComplete="name"
                  error={fieldError(errors.admin?.fullName?.message)}
                  {...register('admin.fullName')}
                />
                <Input
                  label={t('register.adminEmail')}
                  icon={<Mail />}
                  type="email"
                  autoComplete="username"
                  dir="ltr"
                  required
                  error={fieldError(errors.admin?.email?.message)}
                  {...register('admin.email')}
                />
                <Input
                  label={t('register.password')}
                  hint={t('register.passwordHint')}
                  icon={<Lock />}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  error={fieldError(errors.admin?.password?.message)}
                  {...register('admin.password')}
                />
                <Input
                  label={t('register.confirmPassword')}
                  icon={<Lock />}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  error={fieldError(errors.admin?.confirmPassword?.message)}
                  {...register('admin.confirmPassword')}
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
                    {t('register.submit')}
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
