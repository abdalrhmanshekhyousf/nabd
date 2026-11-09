import type { ConsultationView, PatientFile } from '@nabd/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Eye,
  FlaskConical,
  Lock,
  MessageCircleQuestion,
  MessageSquareReply,
  ScanLine,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { ReplyDialog } from '@/components/consultations/ReplyDialog';
import { ImagingOrderDialog } from '@/components/patients/ImagingOrderDialog';
import { LabOrderDialog } from '@/components/patients/LabOrderDialog';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Spinner } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { enter } from '@/lib/motion';
import { PatientFileView } from './PatientFilePage';

type Shared = { consultation: ConsultationView; file: PatientFile };

// The consulted doctor reads the patient's file (task 3.13): read-only, with
// the question on top, and only while it is open. When it is answered or
// withdrawn the server stops sharing it and this page says so (it refreshes
// with the consultations list).
export function ConsultationFilePage() {
  const { t } = useTranslation();
  const { consultationId = '' } = useParams();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'lab' | 'imaging' | 'reply' | null>(null);
  // Orders land in the file: refresh this view of it.
  const close = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.consultationFile(consultationId) });
  };
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.consultationFile(consultationId),
    queryFn: async () =>
      (
        await api.get<Shared>(`/doctors/me/consultations/${consultationId}/file`, {
          skipErrorToast: true,
        })
      ).data,
    retry: false,
  });

  const back = (
    <Link
      to={`/doctor/consultations?open=${consultationId}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
    >
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
      {t('consultations.back')}
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
    const closed = describeApiError(error).code === 'CONSULTATION_CLOSED';
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {back}
        <motion.div {...enter(0)}>
          <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Lock className="size-8 text-muted" aria-hidden="true" />
            <p className="font-semibold text-foreground">
              {closed ? t('consultations.closed') : t('patients.notFound')}
            </p>
            {closed && <p className="text-sm text-muted">{t('consultations.closedHint')}</p>}
          </Card>
        </motion.div>
      </div>
    );
  }

  const { consultation, file } = data;
  return (
    <PatientFileView
      file={file}
      patientId={file.patient.patientId}
      readOnly
      top={
        <div className="space-y-4">
          {back}
          <motion.div {...enter(0)}>
            <Card
              role="note"
              aria-label={t('consultations.questionFrom', { name: consultation.requesterName })}
              className="space-y-2 border-s-4 border-s-accent p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageCircleQuestion className="size-4 text-accent" aria-hidden="true" />
                {t('consultations.questionFrom', { name: consultation.requesterName })}
              </p>
              <p className="text-sm whitespace-pre-line text-foreground">{consultation.question}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Eye className="size-3.5" aria-hidden="true" />
                {t('consultations.readOnly')}
              </p>
            </Card>
          </motion.div>
          <motion.div {...enter(1)} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="success"
              icon={<MessageSquareReply className="size-4" />}
              onClick={() => setDialog('reply')}
            >
              {t('consultations.answer')}
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
          </motion.div>
          <ReplyDialog consultation={consultation} open={dialog === 'reply'} onClose={close} />
          <LabOrderDialog
            open={dialog === 'lab'}
            onClose={close}
            patientId={file.patient.patientId}
            patientName={patientName(file.patient, t)}
          />
          <ImagingOrderDialog
            open={dialog === 'imaging'}
            onClose={close}
            patientId={file.patient.patientId}
            patientName={patientName(file.patient, t)}
          />
        </div>
      }
    />
  );
}
