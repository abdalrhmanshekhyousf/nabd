import type { MeetingView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { hospitalFormat } from '@/lib/hospitalTime';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { MEETING_TONE } from '@/pages/admin/meetingDisplay';

function Meeting({ meeting }: { meeting: MeetingView }) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const queryClient = useQueryClient();
  const [response, setResponse] = useState(meeting.response ?? '');
  const answer = useMutation({
    mutationFn: async (value: 'ACCEPTED' | 'DECLINED') =>
      api.post(`/meetings/${meeting.id}/answer`, { answer: value, response }),
    onSuccess: (_, value) => {
      playSound(value === 'ACCEPTED' ? 'success' : 'toggle');
      notify.success(t(value === 'ACCEPTED' ? 'meetings.accepted' : 'meetings.declined'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMeetings });
    },
  });
  const [now] = useState(() => Date.now());
  const open = meeting.status !== 'CANCELLED' && Date.parse(meeting.startsAt) > now;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={calm}
      aria-label={meeting.topic}
    >
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-semibold text-foreground">{meeting.topic}</p>
            <p className="text-xs text-muted">
              <bdi>{format.full(meeting.startsAt)}</bdi>
              {meeting.calledBy && ` · ${meeting.calledBy.fullName}`}
            </p>
          </div>
          <StatusBadge tone={MEETING_TONE[meeting.status]}>
            {t(`meetings.status.${meeting.status}`)}
          </StatusBadge>
        </div>
        {open && (
          <div className="space-y-2">
            <Input
              label={t('meetings.word')}
              maxLength={300}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<Check className="size-4" />}
                loading={answer.isPending && answer.variables === 'ACCEPTED'}
                onClick={() => answer.mutate('ACCEPTED')}
              >
                {t('meetings.accept')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted hover:bg-danger/10 hover:text-danger"
                icon={<X className="size-4" />}
                loading={answer.isPending && answer.variables === 'DECLINED'}
                onClick={() => answer.mutate('DECLINED')}
              >
                {t('meetings.decline')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </motion.li>
  );
}

// A doctor's meetings with the administration (task 4.10): accept or decline,
// with a word for the admin.
export function DoctorMeetingsPage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.myMeetings,
    queryFn: async () =>
      (await api.get<{ meetings: MeetingView[] }>('/meetings/mine')).data.meetings,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('meetings.mineTitle')}</h2>
        <p className="text-sm text-muted">{t('meetings.mineDescription')}</p>
      </motion.div>
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted">
          <CalendarClock className="size-8 text-muted/60" aria-hidden="true" />
          {t('meetings.none')}
        </Card>
      ) : (
        <ul aria-label={t('meetings.mineTitle')} className="space-y-3">
          <AnimatePresence initial={false}>
            {data.map((meeting) => (
              <Meeting key={meeting.id} meeting={meeting} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
