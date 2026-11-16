import type { ComplaintView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareReply, MessageSquareWarning, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Spinner, Textarea } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function Complaint({ complaint }: { complaint: ComplaintView }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const [reply, setReply] = useState(complaint.reply ?? '');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(complaint.status === 'OPEN');
  const send = useMutation({
    mutationFn: async () =>
      api.post(`/complaints/${complaint.id}/reply`, { reply }, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('adminComplaints.sent'));
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (failure) => {
      playSound('error');
      setError(describeApiError(failure).message);
    },
  });
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={calm}
      aria-label={complaint.subject}
    >
      <Card className="space-y-3 p-4">
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">{complaint.subject}</p>
          <p className="text-xs text-muted">
            {[
              complaint.author.fullName,
              complaint.department
                ? departmentLabel(complaint.department, t)
                : t('complaints.general'),
              date.format(new Date(complaint.createdAt)),
            ].join(' · ')}
          </p>
        </div>
        <p className="text-sm whitespace-pre-line text-foreground">{complaint.body}</p>
        {editing ? (
          <form
            noValidate
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reply.trim()) {
                setError(t('validation.required'));
                playSound('error');
                return;
              }
              setError(null);
              send.mutate();
            }}
          >
            <Textarea
              label={t('adminComplaints.reply')}
              rows={3}
              maxLength={2000}
              value={reply}
              error={error ?? undefined}
              onChange={(event) => setReply(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              loading={send.isPending}
              icon={<Send className="size-4" />}
            >
              {t('adminComplaints.send')}
            </Button>
          </form>
        ) : (
          <div className="flex gap-2 rounded-xl bg-accent-soft/50 p-3 text-sm">
            <MessageSquareReply className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="whitespace-pre-line text-foreground">{complaint.reply}</p>
              <p className="text-xs text-muted">
                {[
                  complaint.repliedByName,
                  complaint.repliedAt && date.format(new Date(complaint.repliedAt)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t('adminComplaints.edit')}
            </Button>
          </div>
        )}
      </Card>
    </motion.li>
  );
}

// The admin's complaints (task 4.9): patients' complaints, oldest open first;
// answer each, and the patient reads the answer on their page.
export function AdminComplaintsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'OPEN' | 'DONE'>('OPEN');
  const { data } = useQuery({
    queryKey: queryKeys.complaints(status),
    queryFn: async () =>
      (await api.get<{ complaints: ComplaintView[] }>('/complaints', { params: { status } })).data
        .complaints,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('adminComplaints.title')}</h2>
          <p className="text-sm text-muted">{t('adminComplaints.description')}</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-muted p-1">
          {(['OPEN', 'DONE'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={status === name}
              onClick={() => {
                playSound('toggle');
                setStatus(name);
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                status === name
                  ? 'bg-surface font-semibold text-foreground shadow-soft'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {t(`adminComplaints.tabs.${name}`)}
            </button>
          ))}
        </div>
      </motion.div>
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted">
          <MessageSquareWarning className="size-8 text-muted/60" aria-hidden="true" />
          {t('adminComplaints.none')}
        </Card>
      ) : (
        <ul aria-label={t('adminComplaints.title')} className="space-y-3">
          <AnimatePresence initial={false}>
            {data.map((complaint) => (
              <Complaint key={complaint.id} complaint={complaint} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
