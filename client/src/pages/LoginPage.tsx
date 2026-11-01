import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type ValidationKey } from '@nabd/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  Building2,
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { canVisit, ROLE_HOME } from '@/app/roles';
import { ROLES, type AuthResponse, type Role } from '@/app/session';
import type { LoginRedirectState } from '@/components/auth/guards';
import { HeartbeatLine } from '@/components/brand/HeartbeatLine';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button, Input } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm, calmSpring, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { startSession } from '@/lib/session';
import { playSound } from '@/lib/sound';

// The same schema validates the request on the server (@nabd/shared). Its
// messages are translation keys, so errors follow a language switch.
type LoginValues = LoginInput;

type HospitalChoice = { id: string; name: string };

// Seed accounts (server/prisma/seed.ts), offered only in development.
const DEMO_PASSWORD = 'Admin@12345';
const DEMO_EMAILS: Record<Role, string> = {
  ADMIN: 'admin@nabd.demo',
  DOCTOR: 'doctor@nabd.demo',
  NURSE: 'nurse@nabd.demo',
  PHARMACIST: 'pharmacist@nabd.demo',
  LAB_TECHNICIAN: 'lab@nabd.demo',
  RADIOLOGIST: 'radiology@nabd.demo',
  CLEANER: 'cleaner@nabd.demo',
  RECEPTIONIST: 'reception@nabd.demo',
  ACCOUNTANT: 'accountant@nabd.demo',
  PATIENT: 'patient@nabd.demo',
};

function BrandPanel() {
  const { t } = useTranslation();
  const features = [
    { icon: Activity, text: t('auth.featureRealtime') },
    { icon: Siren, text: t('auth.featureTriage') },
    { icon: ShieldCheck, text: t('auth.featureSecure') },
  ];

  return (
    <aside className="relative hidden overflow-hidden bg-ink text-clinic lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Monitor grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(245_247_250/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(245_247_250/0.05)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_35%,transparent_80%)] bg-size-[32px_32px]" />
      <motion.div {...enter(0)} className="relative">
        <NabdLogo withWordmark className="text-3xl text-clinic [&_.text-muted]:text-clinic/60" />
      </motion.div>

      <div className="relative space-y-6">
        <motion.h2 {...enter(1)} className="text-4xl leading-tight font-bold">
          {t('auth.brandTitle')}
        </motion.h2>
        <motion.p {...enter(2)} className="max-w-md text-lg text-clinic/70">
          {t('auth.brandBody')}
        </motion.p>
        <ul className="space-y-3">
          {features.map(({ icon: Icon, text }, index) => (
            <motion.li key={text} {...enter(3 + index)} className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-stable/20 text-stable">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="text-clinic/85">{text}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <HeartbeatLine className="relative -mx-12 h-24 w-[calc(100%+6rem)] text-stable" />
    </aside>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hospitals, setHospitals] = useState<HospitalChoice[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const fieldError = (message?: string) => (message ? t(message as ValidationKey) : undefined);

  async function signIn(values: LoginValues, hospitalId?: string) {
    setServerError(null);
    try {
      const { data } = await api.post<AuthResponse>(
        '/auth/login',
        { ...values, hospitalId },
        { skipAuthRefresh: true, skipErrorToast: true },
      );
      await startSession(data);
      notify.success(t('auth.welcome', { name: data.user.fullName }));
      const from = (location.state as LoginRedirectState | null)?.from;
      const target = from && canVisit(from, data.user.role) ? from : ROLE_HOME[data.user.role];
      void navigate(target, { replace: true });
    } catch (error) {
      const { code, message, details } = describeApiError(error);
      if (code === 'HOSPITAL_REQUIRED') {
        setHospitals((details as { hospitals: HospitalChoice[] }).hospitals);
        playSound('notify');
        return;
      }
      setHospitals(null);
      setServerError(message);
      setAttempt((value) => value + 1);
      playSound('error');
    }
  }

  async function chooseHospital(id: string) {
    setChoosing(id);
    await signIn(getValues(), id);
    setChoosing(null);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <main className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-2">
          <NabdLogo withWordmark className="text-2xl lg:invisible" />
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="flex items-center sm:hidden">
              <LanguageToggle compact />
              <ThemeToggle compact />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait" initial={false}>
              {hospitals ? (
                <motion.section
                  key="hospital"
                  aria-labelledby="choose-hospital"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={calm}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h1 id="choose-hospital" className="text-2xl font-bold text-foreground">
                      {t('auth.chooseHospital')}
                    </h1>
                    <p className="text-sm text-muted">{t('auth.chooseHospitalHint')}</p>
                  </div>
                  <ul className="space-y-2">
                    {hospitals.map((hospital, index) => (
                      <motion.li key={hospital.id} {...enter(index)}>
                        <button
                          type="button"
                          disabled={choosing !== null}
                          onClick={() => void chooseHospital(hospital.id)}
                          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-start shadow-soft transition-[border-color,box-shadow] hover:border-accent hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                            <Building2 className="size-5" aria-hidden="true" />
                          </span>
                          <span className="flex-1 font-medium text-foreground">
                            {hospital.name}
                          </span>
                          {choosing === hospital.id && (
                            <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          )}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                  <Button
                    variant="ghost"
                    icon={<ArrowLeft className="size-4 rtl:-scale-x-100" />}
                    onClick={() => setHospitals(null)}
                  >
                    {t('auth.back')}
                  </Button>
                </motion.section>
              ) : (
                <motion.section
                  key="credentials"
                  aria-labelledby="login-title"
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={calm}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <motion.h1
                      {...enter(0)}
                      id="login-title"
                      className="text-2xl font-bold text-foreground sm:text-3xl"
                    >
                      {t('auth.title')}
                    </motion.h1>
                    <motion.p {...enter(1)} className="text-sm text-muted">
                      {t('auth.subtitle')}
                    </motion.p>
                  </div>

                  <AnimatePresence>
                    {serverError && (
                      <motion.div
                        key={attempt}
                        role="alert"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0, x: [0, -8, 8, -6, 6, -3, 3, 0] }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ ...calm, x: { duration: 0.45 } }}
                        className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger"
                      >
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {serverError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form
                    noValidate
                    onSubmit={handleSubmit((values) => signIn(values))}
                    className="space-y-4"
                  >
                    <motion.div {...enter(2)}>
                      <Input
                        label={t('auth.email')}
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        dir="ltr"
                        autoFocus
                        icon={<Mail />}
                        error={fieldError(errors.email?.message)}
                        {...register('email')}
                      />
                    </motion.div>
                    <motion.div {...enter(3)}>
                      <Input
                        label={t('auth.password')}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        dir="ltr"
                        icon={<Lock />}
                        error={fieldError(errors.password?.message)}
                        end={
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                            aria-pressed={showPassword}
                            className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.span
                                key={String(showPassword)}
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={calmSpring}
                              >
                                {showPassword ? (
                                  <EyeOff className="size-4" aria-hidden="true" />
                                ) : (
                                  <Eye className="size-4" aria-hidden="true" />
                                )}
                              </motion.span>
                            </AnimatePresence>
                          </button>
                        }
                        {...register('password')}
                      />
                    </motion.div>
                    <motion.div {...enter(4)}>
                      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                        {t('auth.submit')}
                      </Button>
                    </motion.div>
                  </form>

                  {import.meta.env.DEV && (
                    <details className="group rounded-xl border border-dashed border-border p-3 text-sm">
                      <summary className="cursor-pointer font-medium text-muted select-none">
                        {t('auth.demoAccounts')}
                      </summary>
                      <p className="mt-2 text-xs text-muted">
                        {t('auth.demoHint', { password: DEMO_PASSWORD })}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {ROLES.map((role) => (
                          <button
                            key={role}
                            type="button"
                            aria-label={t('auth.demoUse', { role: t(`roles.${role}`) })}
                            onClick={() => {
                              setValue('email', DEMO_EMAILS[role]);
                              setValue('password', DEMO_PASSWORD);
                              void handleSubmit((values) => signIn(values))();
                            }}
                            className="truncate rounded-lg bg-surface-muted px-2 py-2 text-xs text-foreground transition-colors hover:bg-border focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t(`roles.${role}`)}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
