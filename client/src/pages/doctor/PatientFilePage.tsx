import type {
  ConsultationView,
  ImagingView,
  LabTestStatus,
  LabTestView,
  PatientFile,
  PrescriptionStatus,
  PrescriptionView,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  FileText,
  HeartPulse,
  FilePlus2,
  FlaskConical,
  Paperclip,
  Images,
  MessagesSquare,
  Pill,
  ScanLine,
  Siren,
  X,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ConsultationCard } from '@/components/consultations/ConsultationCard';
import { ConsultationDialog } from '@/components/patients/ConsultationDialog';
import { ImagingOrderDialog } from '@/components/patients/ImagingOrderDialog';
import { ImagingViewer } from '@/components/patients/ImagingViewer';
import { LabOrderDialog } from '@/components/patients/LabOrderDialog';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { PrescriptionDialog } from '@/components/patients/PrescriptionDialog';
import { ReportDialog } from '@/components/patients/ReportDialog';
import { Button, Card, Spinner, StatusBadge, type StatusTone } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { openProtectedFile } from '@/lib/protectedFile';

const PRESCRIPTION_TONE: Record<PrescriptionStatus, StatusTone> = {
  PENDING: 'warning',
  DISPENSED: 'success',
  CANCELLED: 'neutral',
};

const LAB_TONE: Record<LabTestStatus, StatusTone> = {
  REQUESTED: 'warning',
  IN_PROGRESS: 'info',
  DONE: 'success',
  CANCELLED: 'neutral',
};

/** A question to a colleague about this patient; withdrawable until answered (task 3.12). */
function ConsultationItem({
  consultation,
  patientId,
}: {
  consultation: ConsultationView;
  patientId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => api.delete(`/doctors/me/consultations/${consultation.id}`),
    onSuccess: () => notify.success(t('consultations.withdrawn')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) }),
  });
  return (
    <ConsultationCard
      consultation={consultation}
      action={
        consultation.status === 'PENDING' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted hover:bg-danger/10 hover:text-danger"
            icon={<X className="size-4" />}
            loading={withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            {t('consultations.withdraw')}
          </Button>
        )
      }
    />
  );
}

/** One ordered test: what, its state, who ordered it and when; the result once ready. */
function LabTestRow({
  test,
  patientId,
  readOnly,
}: {
  test: LabTestView;
  patientId: string;
  readOnly: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const name = t(`labTests.codes.${test.code}`);
  const cancel = useMutation({
    mutationFn: () => api.delete(`/doctors/me/lab-tests/${test.id}`),
    onSuccess: () => notify.success(t('labTests.cancelled', { name })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) }),
  });
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={calm}
      aria-label={name}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3',
        test.status === 'CANCELLED' && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1 basis-52">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {test.priority === 'URGENT' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
              <Siren className="size-3" aria-hidden="true" />
              {t('labTests.priorities.URGENT')}
            </span>
          )}
          {name}
        </p>
        <p className="text-xs text-muted">
          {t('labTests.orderedBy', { name: test.doctorName })} ·{' '}
          <bdi>{when.format(new Date(test.createdAt))}</bdi>
          {test.notes ? ` · ${test.notes}` : ''}
        </p>
        {test.result && (
          <p className="mt-1 text-sm whitespace-pre-line text-foreground">{test.result}</p>
        )}
        {test.hasResultFile && (
          <button
            type="button"
            onClick={() =>
              openProtectedFile(`/lab-tests/${test.id}/file`).catch((error: unknown) =>
                notify.error(describeApiError(error).message),
              )
            }
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Paperclip className="size-4" aria-hidden="true" />
            {t('labBoard.viewFile')}
          </button>
        )}
      </div>
      {test.abnormal && <StatusBadge tone="danger">{t('labTests.abnormal')}</StatusBadge>}
      <StatusBadge tone={LAB_TONE[test.status]}>{t(`labTests.status.${test.status}`)}</StatusBadge>
      {!readOnly && test.status === 'REQUESTED' && (
        <Button
          size="icon"
          variant="ghost"
          className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
          aria-label={t('labTests.cancel')}
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          <X className="size-4" />
        </Button>
      )}
    </motion.li>
  );
}

/** One ordered imaging study: type and body part, its state, who ordered it; the report once ready. */
function ImagingRow({
  study,
  patientId,
  readOnly,
}: {
  study: ImagingView;
  patientId: string;
  readOnly: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const modality = t(`modalities.${study.modality}`);
  const [viewing, setViewing] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.delete(`/doctors/me/imaging/${study.id}`),
    onSuccess: () => notify.success(t('imaging.cancelled', { modality, part: study.bodyPart })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) }),
  });
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={calm}
      aria-label={`${modality} · ${study.bodyPart}`}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3',
        study.status === 'CANCELLED' && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1 basis-52">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {study.priority === 'URGENT' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
              <Siren className="size-3" aria-hidden="true" />
              {t('labTests.priorities.URGENT')}
            </span>
          )}
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">
            {modality}
          </span>
          {study.bodyPart}
        </p>
        <p className="text-xs text-muted">
          {t('imaging.orderedBy', { name: study.doctorName })} ·{' '}
          <bdi>{when.format(new Date(study.createdAt))}</bdi>
          {study.reason ? ` · ${study.reason}` : ''}
        </p>
        {study.report && (
          <p className="mt-1 text-sm whitespace-pre-line text-foreground">{study.report}</p>
        )}
        {study.imageCount > 0 && (
          <button
            type="button"
            onClick={() => {
              playSound('open');
              setViewing(true);
            }}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Images className="size-4" aria-hidden="true" />
            {t('imagingViewer.open', { count: study.imageCount })}
          </button>
        )}
        <AnimatePresence>
          {viewing && (
            <ImagingViewer
              studyId={study.id}
              count={study.imageCount}
              title={`${modality} · ${study.bodyPart}`}
              onClose={() => {
                playSound('close');
                setViewing(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
      {study.abnormal && <StatusBadge tone="danger">{t('labTests.abnormal')}</StatusBadge>}
      <StatusBadge tone={LAB_TONE[study.status]}>{t(`imaging.status.${study.status}`)}</StatusBadge>
      {!readOnly && study.status === 'REQUESTED' && (
        <Button
          size="icon"
          variant="ghost"
          className="size-9 text-muted hover:bg-danger/10 hover:text-danger"
          aria-label={t('imaging.cancel')}
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          <X className="size-4" />
        </Button>
      )}
    </motion.li>
  );
}

function Section({
  icon,
  title,
  index,
  children,
}: {
  icon: ReactNode;
  title: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <motion.section {...enter(index)} className="space-y-3" aria-label={title}>
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </motion.section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {text}
    </p>
  );
}

/** A highlighted line for what must not be missed (allergies, chronic conditions). */
function Alert({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'danger' | 'warning';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl px-4 py-3 [&_svg]:size-5',
        tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function PrescriptionCard({ prescription }: { prescription: PrescriptionView }) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {prescription.doctorName} · {date.format(new Date(prescription.createdAt))}
        </p>
        <StatusBadge tone={PRESCRIPTION_TONE[prescription.status]}>
          {t(`patients.status.${prescription.status}`)}
        </StatusBadge>
      </div>
      <ul className="space-y-2">
        {prescription.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-lg bg-surface-muted/60 p-3">
            <Pill className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">
                {item.drugName} <span className="font-normal text-muted">· {item.dose}</span>
              </p>
              <p className="text-xs text-muted">
                {item.frequency}
                {item.durationDays ? ` · ${t('patients.days', { count: item.durationDays })}` : ''}
                {item.instructions ? ` · ${item.instructions}` : ''}
              </p>
              {prescription.status === 'DISPENSED' && (
                <p className={cn('text-xs', item.dispensed ? 'text-success' : 'text-warning')}>
                  {item.dispensed ? t('pharmacy.gave', item.dispensed) : t('pharmacy.notGiven')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {prescription.notes && <p className="text-xs text-muted">{prescription.notes}</p>}
      {prescription.dispensedByName && prescription.dispensedAt && (
        <p className="text-xs text-muted">
          {t('pharmacy.dispensedBy', { name: prescription.dispensedByName })} ·{' '}
          <bdi>{date.format(new Date(prescription.dispensedAt))}</bdi>
        </p>
      )}
    </Card>
  );
}

// Doctor: one patient's whole file, read-only (task 2.7). Writing reports and
// prescriptions comes in 2.8.
export function PatientFilePage() {
  const { t } = useTranslation();
  const { patientId = '' } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.patientFile(patientId),
    queryFn: async () =>
      (await api.get<PatientFile>(`/doctors/me/patients/${patientId}`, { skipErrorToast: true }))
        .data,
    retry: false,
  });

  const back = (
    <Link
      to=".."
      relative="path"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
    >
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
      {t('patients.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {back}
        <Card className="px-6 py-12 text-center text-sm text-muted">
          {describeApiError(error).status === 404
            ? t('patients.notFound')
            : describeApiError(error).message}
        </Card>
      </div>
    );
  }

  return <PatientFileView file={data} patientId={patientId} top={back} />;
}

/**
 * A patient's file as shown: to the treating doctor with the tools to write in
 * it, or read-only to a consulted colleague (task 3.13), with `top` above it.
 */
export function PatientFileView({
  file,
  patientId,
  top,
  readOnly = false,
}: {
  file: PatientFile;
  patientId: string;
  top: ReactNode;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [dialog, setDialog] = useState<
    'report' | 'prescription' | 'lab' | 'imaging' | 'consultation' | null
  >(null);
  const dateTime = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const { patient, record, reports, prescriptions, labTests, imaging, consultations } = file;
  const details = [
    [t('patients.bloodType'), patient.bloodType],
    [t('patients.phone'), patient.phone],
    [t('patients.nationalId'), patient.nationalId],
    [t('patients.address'), patient.address],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {top}

      <motion.div {...enter(0)}>
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <PatientAvatar patient={patient} className="size-14 text-xl" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-foreground">
                {patientName(patient, t)}
              </h2>
              <p className="text-sm text-muted">{patientFacts(patient, t)}</p>
              {record.doctorName && (
                <p className="text-xs text-muted">
                  {t('patients.treatingDoctor', { name: record.doctorName })}
                </p>
              )}
            </div>
          </div>
          {details.length > 0 && (
            <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd dir="auto" className="font-medium text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </motion.div>

      <motion.div {...enter(1)} className="grid gap-3 sm:grid-cols-2">
        {record.allergies ? (
          <Alert
            icon={<ShieldAlert />}
            label={t('patients.allergies')}
            value={record.allergies}
            tone="danger"
          />
        ) : (
          <Alert
            icon={<ShieldAlert />}
            label={t('patients.allergies')}
            value={t('patients.noAllergies')}
            tone="warning"
          />
        )}
        {record.chronicConditions && (
          <Alert
            icon={<HeartPulse />}
            label={t('patients.chronic')}
            value={record.chronicConditions}
            tone="warning"
          />
        )}
      </motion.div>

      {!readOnly && (
        <>
          <motion.div {...enter(2)} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button icon={<FilePlus2 className="size-4" />} onClick={() => setDialog('report')}>
              {t('patients.writeReport')}
            </Button>
            <Button
              variant="outline"
              icon={<Pill className="size-4" />}
              onClick={() => setDialog('prescription')}
            >
              {t('patients.newPrescription')}
            </Button>
            <Button
              variant="outline"
              icon={<FlaskConical className="size-4" />}
              onClick={() => setDialog('lab')}
            >
              {t('labTests.order')}
            </Button>
            <Button
              variant="outline"
              icon={<ScanLine className="size-4" />}
              onClick={() => setDialog('imaging')}
            >
              {t('imaging.order')}
            </Button>
            <Button
              variant="outline"
              icon={<MessagesSquare className="size-4" />}
              onClick={() => setDialog('consultation')}
            >
              {t('consultations.ask')}
            </Button>
          </motion.div>

          <ReportDialog
            open={dialog === 'report'}
            onClose={() => setDialog(null)}
            patientId={patientId}
            patientName={patientName(patient, t)}
          />
          <PrescriptionDialog
            open={dialog === 'prescription'}
            onClose={() => setDialog(null)}
            patientId={patientId}
            patientName={patientName(patient, t)}
            allergies={record.allergies}
          />
          <ImagingOrderDialog
            open={dialog === 'imaging'}
            onClose={() => setDialog(null)}
            patientId={patientId}
            patientName={patientName(patient, t)}
          />
          <ConsultationDialog
            open={dialog === 'consultation'}
            onClose={() => setDialog(null)}
            patientId={patientId}
            patientName={patientName(patient, t)}
          />
          <LabOrderDialog
            open={dialog === 'lab'}
            onClose={() => setDialog(null)}
            patientId={patientId}
            patientName={patientName(patient, t)}
          />
        </>
      )}

      <Section icon={<FileText />} title={t('patients.reportsTitle')} index={3}>
        {reports.length === 0 ? (
          <Empty text={t('patients.noReports')} />
        ) : (
          <ol className="relative space-y-3 border-s-2 border-border ps-5">
            {reports.map((report) => (
              <motion.li
                key={report.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={calm}
                className="relative"
              >
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.6rem] top-4 size-3 rounded-full border-2 border-surface bg-accent"
                />
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-foreground">{report.title}</p>
                    <p className="text-xs text-muted">
                      {report.doctorName} · {dateTime.format(new Date(report.createdAt))}
                    </p>
                  </div>
                  {report.diagnosis && (
                    <p className="flex items-center gap-1.5 text-sm text-foreground">
                      <Stethoscope className="size-4 text-accent" aria-hidden="true" />
                      <span className="text-muted">{t('patients.diagnosis')}:</span>{' '}
                      {report.diagnosis}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-line text-foreground">{report.content}</p>
                </Card>
              </motion.li>
            ))}
          </ol>
        )}
      </Section>

      {!readOnly && consultations.length > 0 && (
        <Section icon={<MessagesSquare />} title={t('consultations.title')} index={4}>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {consultations.map((consultation) => (
                  <ConsultationItem
                    key={consultation.id}
                    consultation={consultation}
                    patientId={patientId}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        </Section>
      )}

      <Section icon={<FlaskConical />} title={t('labTests.title')} index={4}>
        {labTests.length === 0 ? (
          <Empty text={t('labTests.none')} />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {labTests.map((test) => (
                <LabTestRow key={test.id} test={test} patientId={patientId} readOnly={readOnly} />
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section icon={<ScanLine />} title={t('imaging.title')} index={5}>
        {imaging.length === 0 ? (
          <Empty text={t('imaging.none')} />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {imaging.map((study) => (
                <ImagingRow
                  key={study.id}
                  study={study}
                  patientId={patientId}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section icon={<Pill />} title={t('patients.prescriptionsTitle')} index={6}>
        {prescriptions.length === 0 ? (
          <Empty text={t('patients.noPrescriptions')} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {prescriptions.map((prescription) => (
              <motion.div
                key={prescription.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={calm}
              >
                <PrescriptionCard prescription={prescription} />
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
