import {
  identifyPatientSchema,
  type IdentifyPatientInput,
  type ReceptionPatient,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, KeyRound, UserCheck, UserPlus, UserRoundSearch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { CredentialsDialog, type Credentials } from '@/components/accounts/CredentialsDialog';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Modal, Spinner, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { RegistrationForm, type Registered } from '@/pages/nurse/NewCasePage';
import { AccountDialog } from './RegisterPatientPage';

type Form = {
  fullName: string;
  gender: 'MALE' | 'FEMALE' | '';
  dateOfBirth: string;
  phone: string;
  nationalId: string;
};
type Identified = { patient: ReceptionPatient; merged: boolean };

/** Naming an unidentified patient; a known national number joins the files. */
function IdentifyDialog({
  patient,
  onClose,
  onIdentified,
}: {
  patient: ReceptionPatient | null;
  onClose: () => void;
  onIdentified: (result: Identified) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>({
    fullName: '',
    gender: patient?.gender ?? '',
    dateOfBirth: '',
    phone: '',
    nationalId: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({});
  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const identify = useMutation({
    mutationFn: async (body: IdentifyPatientInput) =>
      (
        await api.post<Identified>(`/reception/patients/${patient!.patientId}/identify`, body, {
          skipErrorToast: true,
        })
      ).data,
    onSuccess: (result) => {
      playSound('success');
      void queryClient.invalidateQueries({ queryKey: ['reception'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.erQueue });
      onIdentified(result);
    },
    onError: (failure) => {
      playSound('error');
      setErrors({ form: describeApiError(failure).message });
    },
  });

  return (
    <Modal
      open={patient !== null}
      onClose={onClose}
      title={t('erDesk.identifyTitle')}
      description={t('erDesk.identifyHint')}
      size="sm"
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = { ...form, gender: form.gender || undefined };
          const parsed = identifyPatientSchema.safeParse(body);
          if (!parsed.success) {
            const next: typeof errors = {};
            for (const issue of parsed.error.issues) {
              const key = issue.path[0] as keyof Form;
              next[key] ??= t(issue.message as 'validation.required');
            }
            setErrors(next);
            playSound('error');
            return;
          }
          setErrors({});
          identify.mutate(body as IdentifyPatientInput);
        }}
      >
        <Input
          label={t('reception.fullName')}
          required
          value={form.fullName}
          onChange={set('fullName')}
          error={errors.fullName}
        />
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-foreground">{t('reception.gender')}</legend>
          <div role="radiogroup" aria-label={t('reception.gender')} className="flex gap-2">
            {(['MALE', 'FEMALE'] as const).map((gender) => (
              <button
                key={gender}
                type="button"
                role="radio"
                aria-checked={form.gender === gender}
                onClick={() => {
                  playSound('toggle');
                  setForm((current) => ({ ...current, gender }));
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
          {errors.gender && <p className="text-xs text-danger">{errors.gender}</p>}
        </fieldset>
        <Input
          label={t('reception.nationalId')}
          inputMode="numeric"
          dir="ltr"
          value={form.nationalId}
          onChange={set('nationalId')}
          error={errors.nationalId}
          hint={t('erDesk.nationalIdHint')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t('reception.phone')}
            type="tel"
            dir="ltr"
            value={form.phone}
            onChange={set('phone')}
            error={errors.phone}
          />
          <Input
            label={t('reception.dateOfBirth')}
            type="date"
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            error={errors.dateOfBirth}
          />
        </div>
        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          loading={identify.isPending}
          icon={<UserCheck className="size-4" />}
        >
          {t('erDesk.identify')}
        </Button>
      </form>
    </Modal>
  );
}

/** The unidentified patients, newest first, to name when someone knows them. */
function Unidentified({ onIdentify }: { onIdentify: (patient: ReceptionPatient) => void }) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const { data } = useQuery({
    queryKey: queryKeys.unidentified,
    queryFn: async () =>
      (
        await api.get<{ patients: ReceptionPatient[] }>('/reception/patients', {
          params: { anonymous: 'true' },
        })
      ).data.patients,
  });
  if (!data) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <Card className="px-6 py-8 text-center text-sm text-muted">{t('erDesk.noneUnknown')}</Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul aria-label={t('erDesk.unknown')} className="divide-y divide-border">
        <AnimatePresence initial={false}>
          {data.map((patient) => (
            <motion.li
              key={patient.patientId}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={calm}
              aria-label={`${patientName(patient, t)} · ${time.format(new Date(patient.createdAt))}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning">
                <UserRoundSearch className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-medium text-foreground">{patientName(patient, t)}</p>
                <p className="text-xs text-muted">
                  {[patientFacts(patient, t), time.format(new Date(patient.createdAt))]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<UserCheck className="size-4" />}
                onClick={() => onIdentify(patient)}
              >
                {t('erDesk.identify')}
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

// Reception's emergency desk (task 4.3): register an arrival for the ER nurses
// to triage, known or unidentified, as fast as at the ER door (2.11); and name
// an unidentified patient once someone knows them, joining the file of who
// they turn out to be, then open their account if they want one.
export function ReceptionEmergencyPage() {
  const { t } = useTranslation();
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [naming, setNaming] = useState<ReceptionPatient | null>(null);
  const [named, setNamed] = useState<Identified | null>(null);
  const [account, setAccount] = useState<ReceptionPatient | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('erDesk.title')}</h2>
        <p className="text-sm text-muted">{t('erDesk.description')}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <motion.section {...enter(1)} aria-label={t('erDesk.arrival')} className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('erDesk.arrival')}</h3>
          <Card className="p-4 sm:p-6">
            {registered ? (
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
                <p className="text-lg font-bold text-foreground">{t('erDesk.sent')}</p>
                <p className="text-sm text-muted">
                  {registered.isAnonymous
                    ? t('erDesk.sentAnonymous')
                    : t('erDesk.sentKnown', { name: registered.patientName })}
                </p>
                <Button
                  autoFocus
                  icon={<UserPlus className="size-4" />}
                  onClick={() => {
                    setRegistered(null);
                    setFormKey((key) => key + 1);
                  }}
                >
                  {t('er.another')}
                </Button>
              </motion.div>
            ) : (
              <RegistrationForm
                key={formKey}
                endpoint="/reception/er-arrivals"
                onRegistered={setRegistered}
              />
            )}
          </Card>
        </motion.section>

        <motion.section {...enter(2)} aria-label={t('erDesk.unknown')} className="space-y-3">
          <h3 className="font-semibold text-foreground">{t('erDesk.unknown')}</h3>
          <AnimatePresence>
            {named && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={calm}
              >
                <Card className="flex flex-wrap items-center gap-3 border-success/40 bg-success/6 p-4">
                  <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {named.merged
                        ? t('erDesk.merged', { name: named.patient.fullName })
                        : t('erDesk.named', { name: named.patient.fullName })}
                    </p>
                    {named.patient.accountEmail && (
                      <StatusBadge tone="success">{t('reception.hasAccount')}</StatusBadge>
                    )}
                  </div>
                  {!named.patient.accountEmail && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<KeyRound className="size-4" />}
                      onClick={() => setAccount(named.patient)}
                    >
                      {t('reception.openAccount')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setNamed(null)}>
                    {t('common.close')}
                  </Button>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
          <Unidentified onIdentify={setNaming} />
        </motion.section>
      </div>

      <IdentifyDialog
        key={naming?.patientId ?? 'none'}
        patient={naming}
        onClose={() => setNaming(null)}
        onIdentified={(result) => {
          setNaming(null);
          setNamed(result);
          notify.success(
            result.merged
              ? t('erDesk.merged', { name: result.patient.fullName })
              : t('erDesk.named', { name: result.patient.fullName }),
          );
        }}
      />
      <AccountDialog
        patient={account}
        onClose={() => setAccount(null)}
        onOpened={(opened) => {
          setAccount(null);
          setNamed((current) =>
            current
              ? { ...current, patient: { ...current.patient, accountEmail: opened.email } }
              : current,
          );
          setCredentials(opened);
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
