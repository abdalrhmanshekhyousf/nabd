import {
  addLocalDays,
  meetingSchema,
  zonedDate,
  zonedInstant,
  type MeetingView,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Select, Spinner, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { hospitalFormat } from '@/lib/hospitalTime';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { MEETING_TONE } from './meetingDisplay';

type Doctor = { id: string; fullName: string };
type Lists = { upcoming: MeetingView[]; past: MeetingView[] };
type Errors = Partial<Record<'doctorId' | 'startsAt' | 'topic' | 'form', string>>;

function MeetingRow({ meeting, onCancel }: { meeting: MeetingView; onCancel?: () => void }) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={calm}
      aria-label={`${meeting.doctor.fullName} · ${meeting.topic}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-56 space-y-0.5">
        <p className="font-semibold text-foreground">{meeting.doctor.fullName}</p>
        <p className="text-sm text-foreground">{meeting.topic}</p>
        <p className="text-xs text-muted">
          <bdi>{format.full(meeting.startsAt)}</bdi>
        </p>
        {meeting.response && (
          <p className="text-xs text-muted">
            {t('meetings.doctorSaid', { text: meeting.response })}
          </p>
        )}
      </div>
      <StatusBadge tone={MEETING_TONE[meeting.status]}>
        {t(`meetings.status.${meeting.status}`)}
      </StatusBadge>
      {onCancel && meeting.status !== 'CANCELLED' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted hover:bg-danger/10 hover:text-danger"
          icon={<X className="size-4" />}
          onClick={onCancel}
        >
          {t('meetings.cancel')}
        </Button>
      )}
    </motion.li>
  );
}

// The admin's meetings (task 4.10): ask a doctor to meet at a time about
// something; the doctor is told, and accepts or declines on their page.
export function MeetingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tomorrow = addLocalDays(zonedDate(new Date()), 1);
  const [form, setForm] = useState({ doctorId: '', date: tomorrow, time: '10:00', topic: '' });
  const [errors, setErrors] = useState<Errors>({});
  const { data: doctors } = useQuery({
    queryKey: queryKeys.meetingDoctors,
    queryFn: async () =>
      (await api.get<{ staff: Doctor[] }>('/staff', { params: { role: 'DOCTOR' } })).data.staff,
  });
  const { data } = useQuery({
    queryKey: queryKeys.meetings,
    queryFn: async () => (await api.get<Lists>('/meetings')).data,
  });
  const startsAt = () => {
    const [h, m] = form.time.split(':').map(Number);
    return form.date && Number.isFinite(h) && Number.isFinite(m)
      ? zonedInstant(form.date, h! * 60 + m!).toISOString()
      : '';
  };
  const call = useMutation({
    mutationFn: async (body: object) => api.post('/meetings', body, { skipErrorToast: true }),
    onSuccess: () => {
      playSound('success');
      notify.success(t('meetings.sent'));
      setForm((current) => ({ ...current, topic: '' }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    },
    onError: (failure) => {
      playSound('error');
      setErrors({ form: describeApiError(failure).message });
    },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/meetings/${id}`),
    onSuccess: () => {
      playSound('toggle');
      notify.success(t('meetings.cancelled'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings });
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('meetings.title')}</h2>
        <p className="text-sm text-muted">{t('meetings.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="p-4 sm:p-5">
          <form
            noValidate
            aria-label={t('meetings.new')}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const body = { doctorId: form.doctorId, startsAt: startsAt(), topic: form.topic };
              const parsed = meetingSchema.safeParse(body);
              if (!parsed.success) {
                const next: Errors = {};
                for (const issue of parsed.error.issues) {
                  const key = issue.path[0] as keyof Errors;
                  next[key] ??= t(issue.message as 'validation.required');
                }
                setErrors(next);
                playSound('error');
                return;
              }
              setErrors({});
              call.mutate(body);
            }}
          >
            <h3 className="font-semibold text-foreground">{t('meetings.new')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label={t('meetings.doctor')}
                value={form.doctorId}
                error={errors.doctorId}
                placeholder={t('meetings.pickDoctor')}
                options={(doctors ?? []).map((doctor) => ({
                  value: doctor.id,
                  label: doctor.fullName,
                }))}
                onChange={(event) =>
                  setForm((current) => ({ ...current, doctorId: event.target.value }))
                }
              />
              <Input
                label={t('meetings.date')}
                type="date"
                min={zonedDate(new Date())}
                value={form.date}
                error={errors.startsAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, date: event.target.value }))
                }
              />
              <Input
                label={t('meetings.time')}
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm((current) => ({ ...current, time: event.target.value }))
                }
              />
            </div>
            <Input
              label={t('meetings.topic')}
              maxLength={200}
              value={form.topic}
              error={errors.topic}
              onChange={(event) =>
                setForm((current) => ({ ...current, topic: event.target.value }))
              }
            />
            {errors.form && (
              <p role="alert" className="text-sm text-danger">
                {errors.form}
              </p>
            )}
            <Button type="submit" loading={call.isPending} icon={<Send className="size-4" />}>
              {t('meetings.send')}
            </Button>
          </form>
        </Card>
      </motion.div>

      {!data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.section {...enter(2)} aria-label={t('meetings.upcoming')} className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <CalendarClock className="size-5 text-accent" aria-hidden="true" />
              {t('meetings.upcoming')}
            </h3>
            {data.upcoming.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-muted">{t('meetings.none')}</Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {data.upcoming.map((meeting) => (
                      <MeetingRow
                        key={meeting.id}
                        meeting={meeting}
                        onCancel={() => cancel.mutate(meeting.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            )}
          </motion.section>
          {data.past.length > 0 && (
            <motion.section {...enter(3)} aria-label={t('meetings.past')} className="space-y-3">
              <h3 className="font-semibold text-foreground">{t('meetings.past')}</h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {data.past.map((meeting) => (
                    <MeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </ul>
              </Card>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
}
