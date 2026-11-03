import type { PatientSummary } from '@nabd/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, FileText, Pill, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { PatientAvatar } from '@/components/patients/PatientAvatar';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Card, Input, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { relativeTime } from '@/lib/relativeTime';

// Doctor: the patients they treat (task 2.7), searchable; each opens its file.
export function DoctorPatientsPage() {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const { data: patients, isPending } = useQuery({
    queryKey: queryKeys.myPatients(search),
    queryFn: async () =>
      (
        await api.get<{ patients: PatientSummary[] }>('/doctors/me/patients', {
          params: { search: search || undefined },
        })
      ).data.patients,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('patients.title')}</h2>
        <p className="text-sm text-muted">{t('patients.description')}</p>
      </motion.div>

      <motion.div {...enter(1)} className="max-w-md">
        <Input
          label={t('patients.searchLabel')}
          placeholder={t('patients.search')}
          icon={<Search />}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </motion.div>

      <motion.div {...enter(2)} className="space-y-3">
        {isPending ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : patients?.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              {search ? (
                <Search className="size-7" aria-hidden="true" />
              ) : (
                <UserRound className="size-7" aria-hidden="true" />
              )}
            </span>
            <p className="font-semibold text-foreground">
              {search ? t('patients.noResults') : t('patients.emptyTitle')}
            </p>
            {!search && <p className="text-sm text-muted">{t('patients.emptyBody')}</p>}
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted" aria-live="polite">
              {t('patients.count', { count: patients?.length ?? 0 })}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {patients?.map((patient) => (
                <motion.li key={patient.patientId} layout transition={calm}>
                  <Link
                    to={patient.patientId}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lifted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <PatientAvatar patient={patient} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate font-semibold text-foreground">
                        {patientName(patient, t)}
                      </span>
                      <span className="block text-xs text-muted">{patientFacts(patient, t)}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3.5" aria-hidden="true" />
                          {t('patients.reports', { count: patient.reportCount })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Pill className="size-3.5" aria-hidden="true" />
                          {t('patients.prescriptions', { count: patient.prescriptionCount })}
                        </span>
                        <span>
                          {patient.lastReportAt
                            ? t('patients.lastReport', {
                                when: relativeTime(patient.lastReportAt, i18n.language),
                              })
                            : t('patients.noReportsYet')}
                        </span>
                      </span>
                    </span>
                    <ChevronLeft
                      className="size-5 shrink-0 text-muted transition-transform group-hover:text-accent ltr:rotate-180 ltr:group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </motion.div>
    </div>
  );
}
