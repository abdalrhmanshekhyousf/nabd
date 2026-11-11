import type { PatientFile } from '@nabd/shared';
import { FileDown } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { HospitalLogo } from '@/components/layout/HospitalBrand';
import { PrintSheet } from '@/components/print/PrintSheet';
import { Button } from '@/components/ui';
import { useSessionStore } from '@/stores/sessionStore';
import { patientFacts, patientName } from './patientDisplay';

function Block({ title, children, empty }: { title: string; children: ReactNode; empty?: string }) {
  return (
    <section className="space-y-2" style={{ breakInside: 'avoid-page' }}>
      <h2 className="border-b border-border pb-1 text-base font-bold text-foreground">{title}</h2>
      {empty ? <p className="text-sm text-muted">{empty}</p> : children}
    </section>
  );
}

function Entry({
  head,
  meta,
  children,
}: {
  head: ReactNode;
  meta: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="space-y-1 rounded-md border border-border p-2.5"
      style={{ breakInside: 'avoid' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-foreground">{head}</p>
        <p className="text-xs text-muted">{meta}</p>
      </div>
      {children}
    </div>
  );
}

/** The file laid out for paper: hospital on top, every section, Nabd at the foot. */
function FileSheet({ file }: { file: PatientFile }) {
  const { t, i18n } = useTranslation();
  const hospital = useSessionStore((state) => state.user?.hospital);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const { patient, record } = file;
  const details = [
    [t('patients.bloodType'), patient.bloodType],
    [t('patients.phone'), patient.phone],
    [t('patients.nationalId'), patient.nationalId],
    [t('patients.address'), patient.address],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="space-y-5 text-sm">
      <header className="flex items-center justify-between gap-4 border-b-2 border-accent pb-3">
        <div className="flex items-center gap-3">
          {hospital && <HospitalLogo hospital={hospital} className="size-14" />}
          <div>
            <p className="text-lg font-bold text-foreground">{hospital?.name}</p>
            <p className="text-xs text-muted">{t('printFile.title')}</p>
          </div>
        </div>
        <p className="text-xs text-muted">
          {t('printFile.printedAt', { date: dateTime.format(new Date()) })}
        </p>
      </header>

      <section className="space-y-1" style={{ breakInside: 'avoid' }}>
        <p className="text-xl font-bold text-foreground">{patientName(patient, t)}</p>
        <p className="text-muted">{patientFacts(patient, t)}</p>
        {record.doctorName && (
          <p className="text-muted">{t('patients.treatingDoctor', { name: record.doctorName })}</p>
        )}
        {details.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </section>

      <section className="grid grid-cols-2 gap-3" style={{ breakInside: 'avoid' }}>
        <div className="rounded-md border border-danger/40 p-2.5">
          <p className="text-xs font-semibold text-danger">{t('patients.allergies')}</p>
          <p className="text-foreground">{record.allergies || t('patients.noAllergies')}</p>
        </div>
        <div className="rounded-md border border-warning/40 p-2.5">
          <p className="text-xs font-semibold text-warning">{t('patients.chronic')}</p>
          <p className="text-foreground">{record.chronicConditions || '—'}</p>
        </div>
      </section>

      <Block
        title={t('patients.reportsTitle')}
        empty={file.reports.length ? undefined : t('patients.noReports')}
      >
        <div className="space-y-2">
          {file.reports.map((report) => (
            <Entry
              key={report.id}
              head={
                <>
                  {report.consultationId && `${t('consultations.replyBadge')} · `}
                  {report.title}
                </>
              }
              meta={`${report.doctorName} · ${dateTime.format(new Date(report.createdAt))}`}
            >
              {report.diagnosis && (
                <p className="text-foreground">
                  <span className="text-muted">{t('patients.diagnosis')}:</span> {report.diagnosis}
                </p>
              )}
              <p className="whitespace-pre-line text-foreground">{report.content}</p>
            </Entry>
          ))}
        </div>
      </Block>

      <Block
        title={t('patients.prescriptionsTitle')}
        empty={file.prescriptions.length ? undefined : t('patients.noPrescriptions')}
      >
        <div className="space-y-2">
          {file.prescriptions.map((prescription) => (
            <Entry
              key={prescription.id}
              head={t(`patients.status.${prescription.status}`)}
              meta={`${prescription.doctorName} · ${date.format(new Date(prescription.createdAt))}`}
            >
              <ul className="list-inside list-disc text-foreground">
                {prescription.items.map((item) => (
                  <li key={item.id}>
                    <span className="font-medium">{item.drugName}</span> · {item.dose} ·{' '}
                    {item.frequency}
                    {item.durationDays
                      ? ` · ${t('patients.days', { count: item.durationDays })}`
                      : ''}
                    {item.instructions ? ` · ${item.instructions}` : ''}
                  </li>
                ))}
              </ul>
            </Entry>
          ))}
        </div>
      </Block>

      <Block
        title={t('labTests.title')}
        empty={file.labTests.length ? undefined : t('labTests.none')}
      >
        <div className="space-y-2">
          {file.labTests.map((test) => (
            <Entry
              key={test.id}
              head={
                <>
                  {t(`labTests.codes.${test.code}`)}
                  {test.abnormal && ` · ${t('labTests.abnormal')}`}
                </>
              }
              meta={`${t(`labTests.status.${test.status}`)} · ${date.format(new Date(test.createdAt))}`}
            >
              {test.result && <p className="whitespace-pre-line text-foreground">{test.result}</p>}
            </Entry>
          ))}
        </div>
      </Block>

      <Block title={t('imaging.title')} empty={file.imaging.length ? undefined : t('imaging.none')}>
        <div className="space-y-2">
          {file.imaging.map((study) => (
            <Entry
              key={study.id}
              head={`${t(`modalities.${study.modality}`)} · ${study.bodyPart}`}
              meta={`${t(`imaging.status.${study.status}`)} · ${date.format(new Date(study.createdAt))}`}
            >
              {study.report && (
                <p className="whitespace-pre-line text-foreground">{study.report}</p>
              )}
            </Entry>
          ))}
        </div>
      </Block>

      <footer className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span>{t('printFile.footer', { hospital: hospital?.name ?? '' })}</span>
        <span className="inline-flex items-center gap-1.5 text-foreground" dir="ltr">
          Powered by <NabdLogo withWordmark className="text-sm" />
        </span>
      </footer>
    </div>
  );
}

// Prints the medical file or saves it as PDF (task 3.24) from the browser's
// print dialog: the hospital's logo and name on top, "Powered by Nabd" below.
export function PrintFileButton({ file, className }: { file: PatientFile; className?: string }) {
  const { t } = useTranslation();
  const [printing, setPrinting] = useState(false);
  const done = useCallback(() => setPrinting(false), []);
  return (
    <>
      <Button
        variant="outline"
        className={className}
        icon={<FileDown className="size-4" />}
        onClick={() => setPrinting(true)}
      >
        {t('printFile.button')}
      </Button>
      {printing && (
        <PrintSheet onDone={done} testId="file-sheet">
          <FileSheet file={file} />
        </PrintSheet>
      )}
    </>
  );
}
