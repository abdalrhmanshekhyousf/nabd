import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONSCIOUSNESS_LEVELS,
  EXPECTED_EXAMS,
  isAbnormal,
  suggestEsiLevel,
  triageSchema,
  VITAL_RANGES,
  type ErVisit,
  type TriageData,
  type VitalSign,
} from '@nabd/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowRight, Brain, CircleCheck, FlaskConical, Gauge, Wind } from 'lucide-react';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { EsiSuggestion } from '@/components/er/EsiSuggestion';
import { LevelOverride } from '@/components/er/LevelOverride';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fieldError } from '@/lib/fieldError';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { relativeTime } from '@/lib/relativeTime';
import { playSound } from '@/lib/sound';

/** The form holds what the inputs give; the schema turns it into the request. */
type FormValues = {
  chiefComplaint: string;
  breathing: boolean | null;
  consciousness: (typeof CONSCIOUSNESS_LEVELS)[number] | null;
  pulse: number | null;
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  temperature: number | null;
  painScore: number;
  expectedExams: (typeof EXPECTED_EXAMS)[number] | null;
};

const VITALS: { sign: VitalSign; step?: number }[] = [
  { sign: 'pulse' },
  { sign: 'respiratoryRate' },
  { sign: 'systolic' },
  { sign: 'diastolic' },
  { sign: 'oxygenSaturation' },
  { sign: 'temperature', step: 0.1 },
];

/** Empty means "not measured"; a comma is accepted as the decimal point. */
const toNumber = (value: unknown) =>
  value === '' || value === null || value === undefined
    ? null
    : Number(String(value).trim().replace(',', '.'));

function valuesOf(visit: ErVisit): FormValues {
  return {
    chiefComplaint: visit.chiefComplaint ?? '',
    breathing: visit.breathing,
    consciousness: visit.consciousness,
    pulse: visit.pulse,
    systolic: visit.systolic,
    diastolic: visit.diastolic,
    respiratoryRate: visit.respiratoryRate,
    oxygenSaturation: visit.oxygenSaturation,
    temperature: visit.temperature,
    painScore: visit.painScore ?? 0,
    expectedExams: (visit.expectedExams as FormValues['expectedExams']) ?? null,
  };
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 flex items-center gap-2 font-semibold text-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">
          {icon}
        </span>
        {title}
      </legend>
      {hint && <p className="-mt-2 text-xs text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** A row of big choice buttons (radios), for answers that must be quick. */
function Choices<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  error,
  columns = 'grid-cols-2',
}: {
  label: string;
  options: { value: T; label: string; hint?: string; tone?: 'danger' }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  columns?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className={cn('grid gap-2', columns)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <motion.button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                playSound('toggle');
                onChange(option.value);
              }}
              className={cn(
                'flex min-h-11 flex-col justify-center rounded-lg border px-3 py-2 text-start text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                selected && option.tone === 'danger'
                  ? 'border-danger bg-danger/10 font-semibold text-danger'
                  : selected
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-input bg-surface text-foreground hover:border-accent/50',
              )}
            >
              {option.label}
              {option.hint && <span className="text-xs font-normal text-muted">{option.hint}</span>}
            </motion.button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function painWord(
  score: number,
  t: (
    key: 'triage.painNone' | 'triage.painMild' | 'triage.painModerate' | 'triage.painSevere',
  ) => string,
) {
  if (score === 0) return t('triage.painNone');
  if (score <= 3) return t('triage.painMild');
  if (score <= 6) return t('triage.painModerate');
  return t('triage.painSevere');
}

function TriageForm({ visit }: { visit: ErVisit }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, TriageData>({
    resolver: zodResolver(triageSchema) as unknown as Resolver<FormValues, unknown, TriageData>,
    defaultValues: valuesOf(visit),
  });
  const watched = useWatch({ control });
  const pain = watched.painScore ?? 0;
  // The same rules the server applies on save, shown while the form is filled.
  const suggestion = suggestEsiLevel(watched);

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        const { data } = await api.put<{ visit: ErVisit }>(
          `/er/visits/${visit.id}/triage`,
          values,
          {
            skipErrorToast: true,
          },
        );
        queryClient.setQueryData(queryKeys.erVisit(visit.id), data.visit);
        void queryClient.invalidateQueries({ queryKey: queryKeys.erQueue });
        notify.success(t('triage.saved'));
      } catch (error) {
        setError('chiefComplaint', { message: describeApiError(error).message });
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-7">
      <Input
        label={t('triage.complaint')}
        required
        error={fieldError(errors.chiefComplaint?.message, t)}
        {...register('chiefComplaint')}
      />

      <Section icon={<Brain />} title={t('triage.general')}>
        <Controller
          control={control}
          name="breathing"
          render={({ field }) => (
            <Choices
              label={t('triage.breathing')}
              value={field.value}
              onChange={field.onChange}
              error={fieldError(errors.breathing?.message, t)}
              options={[
                { value: true, label: t('triage.yes') },
                { value: false, label: t('triage.no'), tone: 'danger' },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name="consciousness"
          render={({ field }) => (
            <Choices
              label={t('triage.consciousness')}
              value={field.value}
              onChange={field.onChange}
              error={fieldError(errors.consciousness?.message, t)}
              columns="grid-cols-2 lg:grid-cols-4"
              options={CONSCIOUSNESS_LEVELS.map((level) => ({
                value: level,
                label: t(`triage.${level}`),
                hint: t(`triage.${level}_hint`),
                tone: level === 'UNRESPONSIVE' ? 'danger' : undefined,
              }))}
            />
          )}
        />
      </Section>

      <Section icon={<Activity />} title={t('triage.vitals')} hint={t('triage.vitalsHint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {VITALS.map(({ sign, step }) => {
            const range = VITAL_RANGES[sign];
            const abnormal = isAbnormal(sign, watched[sign] ?? null);
            return (
              <div key={sign} className="space-y-1">
                <Input
                  label={t(`triage.${sign}`)}
                  // Text with a number keypad: a number field would localize the
                  // digits and change the reading when the mouse wheel scrolls over it.
                  type="text"
                  inputMode={step ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  className={cn(
                    'pe-16',
                    abnormal && 'border-warning focus-visible:ring-warning/40',
                  )}
                  end={
                    <span className="pe-3 text-xs text-muted" dir="ltr">
                      {range.unit}
                    </span>
                  }
                  error={fieldError(errors[sign]?.message, t)}
                  {...register(sign, { setValueAs: toNumber })}
                />
                <AnimatePresence initial={false}>
                  {abnormal && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={calm}
                      className="inline-flex items-center gap-1 rounded-md bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning"
                    >
                      <Gauge className="size-3.5" aria-hidden="true" />
                      {t('triage.abnormal', { min: range.min, max: range.max })}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Section>

      <Section icon={<Wind />} title={t('triage.pain')}>
        <Controller
          control={control}
          name="painScore"
          render={({ field }) => (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <motion.span
                  key={pain}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={calm}
                  className={cn(
                    'text-3xl font-bold tabular-nums',
                    pain >= 7 ? 'text-danger' : pain >= 4 ? 'text-warning' : 'text-success',
                  )}
                >
                  {pain}
                  <span className="text-sm font-normal text-muted"> / 10</span>
                </motion.span>
                <span className="text-sm font-medium text-muted">{painWord(pain, t)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                aria-label={t('triage.pain')}
                aria-valuetext={`${pain} / 10 · ${painWord(pain, t)}`}
                value={field.value}
                onChange={(event) => field.onChange(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-success via-warning to-danger accent-foreground rtl:bg-gradient-to-l"
              />
            </div>
          )}
        />
      </Section>

      <Section icon={<FlaskConical />} title={t('triage.exams')} hint={t('triage.examsHint')}>
        <Controller
          control={control}
          name="expectedExams"
          render={({ field }) => (
            <Choices
              label={t('triage.exams')}
              value={field.value}
              onChange={field.onChange}
              error={fieldError(errors.expectedExams?.message, t)}
              columns="grid-cols-3"
              options={EXPECTED_EXAMS.map((count) => ({
                value: count,
                label: t(`triage.exams${count}`),
              }))}
            />
          )}
        />
      </Section>

      <EsiSuggestion
        level={suggestion.level}
        reasons={suggestion.reasons}
        savedLevel={visit.level}
      />

      <div className="space-y-2">
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting}
          icon={<CircleCheck className="size-4" />}
        >
          {t('triage.save')}
        </Button>
        {visit.assessedAt && (
          <p className="text-center text-xs text-muted" aria-live="polite">
            {t('triage.savedAt', { time: time.format(new Date(visit.assessedAt)) })}
          </p>
        )}
      </div>
    </form>
  );
}

// ER nurse: the triage form for one arrival (task 2.12).
export function TriagePage() {
  const { t, i18n } = useTranslation();
  const { visitId = '' } = useParams();
  const {
    data: visit,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.erVisit(visitId),
    queryFn: async () =>
      (await api.get<{ visit: ErVisit }>(`/er/visits/${visitId}`, { skipErrorToast: true })).data
        .visit,
    retry: false,
  });

  const back = (
    <Link
      to="../../emergency"
      relative="path"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
    >
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
      {t('triage.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error || !visit) {
    const { status, message } = describeApiError(error);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <Card className="px-6 py-12 text-center text-sm text-muted">
          {status === 404 ? t('triage.notFound') : message}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <motion.div {...enter(0)}>
        <Card className="space-y-1 p-5">
          <h2 className="text-xl font-bold text-foreground">{patientName(visit.patient, t)}</h2>
          <p className="text-sm text-muted">
            {[
              patientFacts(visit.patient, t),
              t('triage.arrived', { when: relativeTime(visit.arrivedAt, i18n.language) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {visit.arrivalNote && <p className="text-sm text-foreground">{visit.arrivalNote}</p>}
        </Card>
      </motion.div>
      <motion.div {...enter(1)}>
        <Card className="p-4 sm:p-6">
          {/* A new key when the visit is saved keeps the form's values in step. */}
          <TriageForm key={visit.assessedAt ?? 'new'} visit={visit} />
        </Card>
      </motion.div>
      <motion.div {...enter(2)}>
        <LevelOverride visit={visit} />
      </motion.div>
    </div>
  );
}
