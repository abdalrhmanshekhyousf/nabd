import { complaintSchema, type ComplaintStatus, type ComplaintView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareReply, MessageSquareWarning, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel, type Department } from '@/components/departments/departmentDisplay';
import {
  Button,
  Card,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

const TONE: Record<ComplaintStatus, StatusTone> = {
  OPEN: 'warning',
  ANSWERED: 'success',
  CLOSED: 'neutral',
};

type Errors = Partial<Record<'subject' | 'body' | 'form', string>>;

// The patient's complaints (task 4.8): tell the administration what went
// wrong, maybe in which department, and read its answer here (4.9).
export function ComplaintsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const [form, setForm] = useState({ departmentId: '', subject: '', body: '' });
  const [errors, setErrors] = useState<Errors>({});
  const { data: departments } = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () =>
      (await api.get<{ departments: Department[] }>('/departments')).data.departments,
  });
  const { data } = useQuery({
    queryKey: queryKeys.myComplaints,
    queryFn: async () =>
      (await api.get<{ complaints: ComplaintView[] }>('/complaints/mine')).data.complaints,
  });
  const file = useMutation({
    mutationFn: async () =>
      api.post(
        '/complaints',
        { ...form, departmentId: form.departmentId || null },
        { skipErrorToast: true },
      ),
    onSuccess: () => {
      playSound('success');
      notify.success(t('complaints.sent'));
      setForm({ departmentId: '', subject: '', body: '' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myComplaints });
    },
    onError: (failure) => {
      playSound('error');
      setErrors({ form: describeApiError(failure).message });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('complaints.title')}</h2>
        <p className="text-sm text-muted">{t('complaints.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="p-4 sm:p-5">
          <form
            noValidate
            aria-label={t('complaints.new')}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = complaintSchema.safeParse({
                ...form,
                departmentId: form.departmentId || null,
              });
              if (!parsed.success) {
                const next: Errors = {};
                for (const issue of parsed.error.issues) {
                  const key = issue.path[0] as 'subject' | 'body';
                  next[key] ??= t(issue.message as 'validation.required');
                }
                setErrors(next);
                playSound('error');
                return;
              }
              setErrors({});
              file.mutate();
            }}
          >
            <h3 className="font-semibold text-foreground">{t('complaints.new')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('complaints.subject')}
                maxLength={120}
                value={form.subject}
                error={errors.subject}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subject: event.target.value }))
                }
              />
              <Select
                label={t('complaints.department')}
                value={form.departmentId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, departmentId: event.target.value }))
                }
                options={[
                  { value: '', label: t('complaints.general') },
                  ...(departments ?? []).map((department) => ({
                    value: department.id,
                    label: departmentLabel(department, t),
                  })),
                ]}
              />
            </div>
            <Textarea
              label={t('complaints.body')}
              rows={4}
              maxLength={2000}
              value={form.body}
              error={errors.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            />
            {errors.form && (
              <p role="alert" className="text-sm text-danger">
                {errors.form}
              </p>
            )}
            <Button type="submit" loading={file.isPending} icon={<Send className="size-4" />}>
              {t('complaints.send')}
            </Button>
          </form>
        </Card>
      </motion.div>

      <motion.section {...enter(2)} aria-label={t('complaints.mine')} className="space-y-3">
        <h3 className="font-semibold text-foreground">{t('complaints.mine')}</h3>
        {!data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : data.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
            <MessageSquareWarning className="size-8 text-muted/60" aria-hidden="true" />
            {t('complaints.none')}
          </Card>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {data.map((complaint) => (
                <motion.li
                  key={complaint.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={calm}
                  aria-label={complaint.subject}
                >
                  <Card className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="min-w-0 flex-1 font-semibold text-foreground">
                        {complaint.subject}
                      </p>
                      <StatusBadge tone={TONE[complaint.status]}>
                        {t(`complaints.status.${complaint.status}`)}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted">
                      {[
                        date.format(new Date(complaint.createdAt)),
                        complaint.department
                          ? departmentLabel(complaint.department, t)
                          : t('complaints.general'),
                      ].join(' · ')}
                    </p>
                    <p className="text-sm whitespace-pre-line text-foreground">{complaint.body}</p>
                    {complaint.reply && (
                      <div className="flex gap-2 rounded-xl bg-accent-soft/50 p-3 text-sm">
                        <MessageSquareReply
                          className="mt-0.5 size-4 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-accent">
                            {t('complaints.answer')}
                          </p>
                          <p className="whitespace-pre-line text-foreground">{complaint.reply}</p>
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </motion.section>
    </div>
  );
}
