import { consultationReplySchema, type ConsultationView } from '@nabd/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareReply } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function ReplyForm({
  consultation,
  onDone,
}: {
  consultation: ConsultationView;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [reply, setReply] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [error, setError] = useState<{ reply?: string; form?: string }>({});

  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ consultation: ConsultationView }>(
          `/doctors/me/consultations/${consultation.id}/reply`,
          { reply, diagnosis },
          { skipErrorToast: true },
        )
      ).data.consultation,
    onSuccess: () => {
      notify.success(t('consultations.replied', { name: consultation.requesterName }));
      onDone();
      // The file closes with the answer: back to the list, on this question.
      void navigate(`/doctor/consultations?open=${consultation.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.consultations });
    },
    onError: (failure) => {
      setError({ form: describeApiError(failure).message });
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!consultationReplySchema.safeParse({ reply, diagnosis }).success) {
          setError({ reply: t('validation.required') });
          return playSound('error');
        }
        send.mutate();
      }}
    >
      <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm whitespace-pre-line text-foreground">
        {consultation.question}
      </p>
      <Input
        label={t('patients.diagnosis')}
        maxLength={300}
        value={diagnosis}
        onChange={(event) => setDiagnosis(event.target.value)}
      />
      <Textarea
        label={t('consultations.reply')}
        hint={t('consultations.replyHint')}
        required
        rows={5}
        maxLength={2000}
        value={reply}
        error={error.reply}
        onChange={(event) => {
          setReply(event.target.value);
          setError({});
        }}
      />
      <AnimatePresence>
        {error.form && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-danger"
          >
            {error.form}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 sm:-bottom-5 sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant="success"
          loading={send.isPending}
          icon={<MessageSquareReply className="size-4" />}
        >
          {t('consultations.sendReply')}
        </Button>
      </div>
    </form>
  );
}

// The consultant's answer (task 3.14): it goes into the patient's file as a
// report and tells the asking doctor; the file then closes for the consultant.
export function ReplyDialog({
  consultation,
  open,
  onClose,
}: {
  consultation: ConsultationView;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('consultations.replyTo', { name: consultation.requesterName })}
    >
      {open && <ReplyForm consultation={consultation} onDone={onClose} />}
    </Modal>
  );
}
