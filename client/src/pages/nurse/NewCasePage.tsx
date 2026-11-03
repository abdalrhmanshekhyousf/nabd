import { zodResolver } from '@hookform/resolvers/zod';
import { GENDERS, quickRegistrationSchema, type QuickRegistrationData } from '@nabd/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CircleCheck,
  IdCard,
  ListOrdered,
  Phone,
  ShieldAlert,
  Stethoscope,
  UserPlus,
  UserRound,
  UserRoundSearch,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Spinner, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

/** One flat form for both kinds of arrival; the schema keeps what applies. */
type FormValues = {
  anonymous: boolean;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  nationalId: string;
  gender: (typeof GENDERS)[number] | null;
  chiefComplaint: string;
  arrivalNote: string;
};

type Registered = {
  id: string;
  patientName: string | null;
  isAnonymous: boolean;
  returning: boolean;
  arrivedAt: string;
};

const BLANK: FormValues = {
  anonymous: false,
  fullName: '',
  phone: '',
  dateOfBirth: '',
  nationalId: '',
  gender: null,
  chiefComplaint: '',
  arrivalNote: '',
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Male, female, or not known (an empty value saves as null). */
const GENDER_CHOICES: ((typeof GENDERS)[number] | null)[] = [...GENDERS, null];

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

/** A big two-way choice at the top: known or unidentified. */
function KindChoice({
  anonymous,
  onChange,
}: {
  anonymous: boolean;
  onChange: (anonymous: boolean) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { value: false, icon: <UserRound />, label: t('er.known'), hint: t('er.knownHint') },
    {
      value: true,
      icon: <UserRoundSearch />,
      label: t('er.anonymous'),
      hint: t('er.anonymousHint'),
    },
  ];
  return (
    <div role="radiogroup" aria-label={t('er.newCaseTitle')} className="grid grid-cols-2 gap-3">
      {options.map((option) => {
        const selected = option.value === anonymous;
        return (
          <motion.button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!selected) playSound('toggle');
              onChange(option.value);
            }}
            className={cn(
              'flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none sm:p-4 [&_svg]:size-5',
              selected
                ? 'border-accent bg-accent-soft/60 text-accent'
                : 'border-border bg-surface text-muted hover:border-accent/40',
            )}
          >
            {option.icon}
            <span className="font-semibold text-foreground">{option.label}</span>
            <span className="text-xs text-muted">{option.hint}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function RegistrationForm({ onRegistered }: { onRegistered: (visit: Registered) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, QuickRegistrationData>({
    resolver: zodResolver(quickRegistrationSchema) as unknown as Resolver<
      FormValues,
      unknown,
      QuickRegistrationData
    >,
    defaultValues: BLANK,
  });
  const anonymous = useWatch({ control, name: 'anonymous' });

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        const { data } = await api.post<{ visit: Registered }>('/er/visits', values, {
          skipErrorToast: true,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.erQueue });
        notify.success(t('er.registered'));
        onRegistered(data.visit);
      } catch (error) {
        setError('chiefComplaint', { message: describeApiError(error).message });
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <KindChoice
        anonymous={anonymous}
        onChange={(value) => setValue('anonymous', value, { shouldValidate: false })}
      />

      <Reveal show={!anonymous}>
        <div className="grid gap-4 pb-1 sm:grid-cols-2">
          <Input
            label={t('er.fullName')}
            icon={<UserRound />}
            required={!anonymous}
            autoFocus
            error={fieldError(errors.fullName?.message, t)}
            {...register('fullName')}
          />
          <Input
            label={t('er.phone')}
            icon={<Phone />}
            type="tel"
            inputMode="tel"
            dir="ltr"
            error={fieldError(errors.phone?.message, t)}
            {...register('phone')}
          />
          <Input
            label={t('er.nationalId')}
            hint={t('er.nationalIdHint')}
            icon={<IdCard />}
            dir="ltr"
            error={fieldError(errors.nationalId?.message, t)}
            {...register('nationalId')}
          />
          <Input
            label={t('er.dateOfBirth')}
            icon={<CalendarDays />}
            type="date"
            max={today()}
            min="1900-01-01"
            dir="ltr"
            error={fieldError(errors.dateOfBirth?.message, t)}
            {...register('dateOfBirth')}
          />
        </div>
      </Reveal>

      <fieldset className="min-w-0 space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium text-foreground">{t('er.gender')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_CHOICES.map((value) => (
            <label key={value ?? 'unknown'} className="relative">
              <input
                type="radio"
                value={value ?? ''}
                className="peer sr-only"
                {...register('gender', { setValueAs: emptyToNull })}
              />
              <span className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-input bg-surface text-sm text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring hover:border-accent/50">
                {value ? t(`er.${value}`) : t('er.unknownGender')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        label={t('er.chiefComplaint')}
        placeholder={t('er.chiefComplaintPlaceholder')}
        required
        error={fieldError(errors.chiefComplaint?.message, t)}
        {...register('chiefComplaint')}
      />
      <Textarea
        label={t('er.arrivalNote')}
        placeholder={t('er.arrivalNotePlaceholder')}
        rows={2}
        error={fieldError(errors.arrivalNote?.message, t)}
        {...register('arrivalNote')}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={isSubmitting}
        icon={<UserPlus className="size-4" />}
      >
        {t('er.register')}
      </Button>
    </form>
  );
}

function Success({ visit, onAnother }: { visit: Registered; onAnother: () => void }) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const message = visit.isAnonymous
    ? t('er.successAnonymous')
    : t(visit.returning ? 'er.successReturning' : 'er.successKnown', { name: visit.patientName });
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={calm}
      role="status"
      className="flex flex-col items-center gap-3 py-6 text-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
        <CircleCheck className="size-8" aria-hidden="true" />
      </span>
      <p className="text-lg font-bold text-foreground">{t('er.successTitle')}</p>
      <p className="text-sm text-foreground">{message}</p>
      <p className="text-xs text-muted">
        {t('er.arrivedAt', { time: time.format(new Date(visit.arrivedAt)) })}
      </p>
      <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Link
          to={`../triage/${visit.id}`}
          relative="path"
          autoFocus
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/88 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
        >
          <Stethoscope className="size-4" aria-hidden="true" />
          {t('er.assessNow')}
        </Link>
        <Button variant="outline" icon={<UserPlus className="size-4" />} onClick={onAnother}>
          {t('er.another')}
        </Button>
        <Link
          to="../emergency"
          relative="path"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          <ListOrdered className="size-4" aria-hidden="true" />
          {t('er.toQueue')}
        </Link>
      </div>
    </motion.div>
  );
}

// ER nurse: quick registration of an arrival, known or unidentified (task 2.11).
export function NewCasePage() {
  const { t } = useTranslation();
  const [registered, setRegistered] = useState<Registered | null>(null);
  // A new key gives a fresh, empty form for the next arrival.
  const [formKey, setFormKey] = useState(0);
  const { data: access, isPending } = useQuery({
    queryKey: queryKeys.erAccess,
    queryFn: async () => (await api.get<{ canRegister: boolean }>('/er/me')).data,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('er.newCaseTitle')}</h2>
        <p className="text-sm text-muted">{t('er.newCaseHint')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="p-4 sm:p-6">
          {isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !access?.canRegister ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-warning/12 text-warning">
                <ShieldAlert className="size-7" aria-hidden="true" />
              </span>
              <p className="font-semibold text-foreground">{t('er.notErTitle')}</p>
              <p className="max-w-sm text-sm text-muted">{t('er.notErBody')}</p>
            </div>
          ) : registered ? (
            <Success
              visit={registered}
              onAnother={() => {
                setRegistered(null);
                setFormKey((key) => key + 1);
              }}
            />
          ) : (
            <RegistrationForm key={formKey} onRegistered={setRegistered} />
          )}
        </Card>
      </motion.div>
    </div>
  );
}
