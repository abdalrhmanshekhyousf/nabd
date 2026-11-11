import type { AppointmentView, PatientFile } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Card, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { hospitalFormat } from '@/lib/hospitalTime';
import { enter } from '@/lib/motion';
import { PatientFileView } from '@/pages/doctor/PatientFilePage';

/** The coming visits at the top of the file: the patient's follow-ups. */
function FollowUps() {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const { data } = useQuery({
    queryKey: queryKeys.myAppointments,
    queryFn: async () =>
      (
        await api.get<{ upcoming: AppointmentView[]; past: AppointmentView[] }>(
          '/appointments/mine',
        )
      ).data,
  });
  const upcoming = data?.upcoming ?? [];
  return (
    <motion.section {...enter(0)} aria-label={t('myFile.followUps')}>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarClock className="size-5 text-accent" aria-hidden="true" />
            {t('myFile.followUps')}
          </h3>
          <Link
            to="/patient/appointments?book=1"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            {t('appointments.book')}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{t('appointments.noneUpcoming')}</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.slice(0, 3).map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-accent-soft/50 px-3 py-2 text-sm"
              >
                <bdi className="font-medium text-foreground">{format.full(visit.startsAt)}</bdi>
                <span className="text-xs text-muted">
                  {visit.doctorName}
                  {visit.department && ` · ${departmentLabel(visit.department, t)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </motion.section>
  );
}

// The patient's own medical file (task 3.23): their follow-up visits, then
// everything the doctors wrote and ordered — reports, prescriptions (and what
// the pharmacy handed over), lab results with their files, and imaging with
// the viewer — read-only.
export function MedicalFilePage() {
  const { t } = useTranslation();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.myFile,
    queryFn: async () =>
      (await api.get<PatientFile>('/patients/me/file', { skipErrorToast: true })).data,
    retry: false,
  });
  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="mx-auto max-w-xl px-6 py-12 text-center text-sm text-muted">
        {describeApiError(error).status === 404
          ? t('myFile.none')
          : describeApiError(error).message}
      </Card>
    );
  }
  return (
    <PatientFileView
      file={data}
      patientId={data.patient.patientId}
      readOnly
      top={
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">{t('myFile.title')}</h2>
            <p className="text-sm text-muted">{t('myFile.description')}</p>
          </div>
          <FollowUps />
        </div>
      }
    />
  );
}
