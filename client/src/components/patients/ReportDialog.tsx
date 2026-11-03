import { zodResolver } from '@hookform/resolvers/zod';
import { createReportSchema, type CreateReportData, type CreateReportInput } from '@nabd/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Stethoscope } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { fieldError } from '@/lib/fieldError';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function ReportForm({
  patientId,
  patientName,
  onDone,
}: {
  patientId: string;
  patientName: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateReportInput, unknown, CreateReportData>({
    resolver: zodResolver(createReportSchema),
    defaultValues: { title: '', diagnosis: '', content: '' },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        await api.post(`/doctors/me/patients/${patientId}/reports`, values, {
          skipErrorToast: true,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) }),
          queryClient.invalidateQueries({ queryKey: ['my-patients'] }),
        ]);
        notify.success(t('patients.reportSaved', { name: patientName }));
        onDone();
      } catch (error) {
        setError('title', { message: describeApiError(error).message });
        playSound('error');
      }
    },
    () => playSound('error'),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <Input
        label={t('patients.reportTitle')}
        placeholder={t('patients.reportTitlePlaceholder')}
        required
        autoFocus
        error={fieldError(errors.title?.message, t)}
        {...register('title')}
      />
      <Input
        label={t('patients.diagnosisOptional')}
        icon={<Stethoscope />}
        error={fieldError(errors.diagnosis?.message, t)}
        {...register('diagnosis')}
      />
      <Textarea
        label={t('patients.content')}
        placeholder={t('patients.contentPlaceholder')}
        rows={6}
        required
        error={fieldError(errors.content?.message, t)}
        {...register('content')}
      />
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={isSubmitting} icon={<Check className="size-4" />}>
          {t('patients.saveReport')}
        </Button>
      </div>
    </form>
  );
}

// A medical report in the patient's file (task 2.8). The form only exists while
// open, so every opening starts empty.
export function ReportDialog({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('patients.reportDialog', { name: patientName })}
      size="lg"
    >
      {open && <ReportForm patientId={patientId} patientName={patientName} onDone={onClose} />}
    </Modal>
  );
}
