import { createConsultationSchema, type ConsultationView, type DoctorOption } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Search, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { DOCTOR_STATUS_DOT } from '@/components/doctor/doctorStatusStyles';
import { Button, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function ConsultationForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [consultantId, setConsultantId] = useState('');
  const [question, setQuestion] = useState('');
  const [errors, setErrors] = useState<{ doctor?: string; question?: string; form?: string }>({});

  const { data: doctors } = useQuery({
    queryKey: queryKeys.colleagues,
    queryFn: async () =>
      (await api.get<{ doctors: DoctorOption[] }>('/doctors/me/colleagues')).data.doctors,
  });
  const needle = search.trim().toLowerCase();
  const shown = (doctors ?? []).filter((doctor) =>
    [
      doctor.fullName,
      doctor.specialty,
      doctor.department ? departmentLabel(doctor.department, t) : '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );

  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ consultation: ConsultationView }>(
          `/doctors/me/patients/${patientId}/consultations`,
          { consultantId, question },
          { skipErrorToast: true },
        )
      ).data.consultation,
    onSuccess: (consultation) => {
      notify.success(t('consultations.sent', { name: consultation.consultantName }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.patientFile(patientId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.consultations });
      onDone();
    },
    onError: (failure) => {
      setErrors({ form: describeApiError(failure).message });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = createConsultationSchema.safeParse({ consultantId, question });
        if (!parsed.success) {
          const fields = parsed.error.issues.map((issue) => issue.path[0]);
          setErrors({
            doctor: fields.includes('consultantId') ? t('consultations.pickDoctor') : undefined,
            question: fields.includes('question') ? t('validation.required') : undefined,
          });
          return playSound('error');
        }
        send.mutate();
      }}
    >
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {t('consultations.doctor')}
        </legend>
        <Input
          label={t('consultations.searchDoctor')}
          icon={<Search />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!doctors ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <ul
            role="radiogroup"
            aria-label={t('consultations.doctor')}
            className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1"
          >
            {shown.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted">
                {t('consultations.noDoctor')}
              </li>
            )}
            {shown.map((doctor) => {
              const chosen = doctor.id === consultantId;
              return (
                <li key={doctor.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => {
                      playSound('tap');
                      setConsultantId(doctor.id);
                      setErrors((current) => ({ ...current, doctor: undefined }));
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors',
                      chosen ? 'bg-accent-soft' : 'hover:bg-surface-muted',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2.5 shrink-0 rounded-full',
                        DOCTOR_STATUS_DOT[doctor.status],
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {doctor.fullName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {doctor.specialty}
                        {doctor.department && ` · ${departmentLabel(doctor.department, t)}`}
                        {` · ${t(`doctorStatus.${doctor.status}`)}`}
                      </span>
                    </span>
                    <AnimatePresence>
                      {chosen && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={calm}
                        >
                          <Check className="size-4 text-accent" aria-hidden="true" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {errors.doctor && (
          <p role="alert" className="text-sm text-danger">
            {errors.doctor}
          </p>
        )}
      </fieldset>
      <Textarea
        label={t('consultations.question')}
        hint={t('consultations.questionHint')}
        required
        rows={4}
        maxLength={1000}
        value={question}
        error={errors.question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setErrors((current) => ({ ...current, question: undefined }));
        }}
      />
      <AnimatePresence>
        {errors.form && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-danger"
          >
            {errors.form}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          loading={send.isPending}
          icon={<Send className="size-4 rtl:-scale-x-100" />}
        >
          {t('consultations.send')}
        </Button>
      </div>
    </form>
  );
}

// Asking a colleague about my patient (task 3.12): pick the doctor, write the
// question; they get a notification and, from 3.13, read access to the file.
export function ConsultationDialog({
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
      title={t('consultations.dialog', { patient: patientName })}
    >
      {open && <ConsultationForm patientId={patientId} onDone={onClose} />}
    </Modal>
  );
}
