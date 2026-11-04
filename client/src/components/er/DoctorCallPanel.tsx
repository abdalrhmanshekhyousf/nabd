import {
  availableAlternatives,
  type DoctorCallView,
  type DoctorOption,
  type ErVisit,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CircleCheck, CircleX, PhoneCall, Search, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { DOCTOR_STATUS_TONE } from '@/components/doctor/doctorStatusStyles';
import { Button, Card, Input, Spinner, StatusBadge } from '@/components/ui';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';
import { relativeTime } from '@/lib/relativeTime';

function useCalls(visitId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.erVisit(visitId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.erQueue }),
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors }),
    ]);
  const call = useMutation({
    mutationFn: async (doctor: DoctorOption) =>
      (
        await api.post<{ call: DoctorCallView }>(
          `/er/visits/${visitId}/calls`,
          { doctorId: doctor.id },
          { skipErrorToast: true },
        )
      ).data.call,
    onSuccess: (_call, doctor) =>
      notify.success(t('triage.call.called', { name: doctor.fullName })),
    // Someone else may have changed in the meantime (became busy, another call).
    onError: (error) => notify.error(describeApiError(error).message),
    onSettled: settle,
  });
  const cancel = useMutation({
    mutationFn: (callId: string) => api.delete(`/er/visits/${visitId}/calls/${callId}`),
    onSuccess: () => notify.info(t('triage.call.cancelled')),
    onSettled: settle,
  });
  return { call, cancel };
}

function DoctorRow({
  doctor,
  selected,
  onSelect,
}: {
  doctor: DoctorOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        playSound('toggle');
        onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
        selected
          ? 'border-accent bg-accent-soft/60'
          : 'border-border bg-surface hover:border-accent/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{doctor.fullName}</span>
        <span className="block truncate text-xs text-muted">
          {doctor.specialty}
          {doctor.department ? ` · ${departmentLabel(doctor.department, t)}` : ''}
        </span>
      </span>
      <StatusBadge tone={DOCTOR_STATUS_TONE[doctor.status]}>
        {t(`doctorStatus.${doctor.status}`)}
      </StatusBadge>
    </button>
  );
}

function CallButton({
  doctor,
  onCall,
  loading,
}: {
  doctor: DoctorOption;
  onCall: (d: DoctorOption) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      icon={<PhoneCall className="size-4" />}
      loading={loading}
      onClick={() => onCall(doctor)}
    >
      {t('triage.call.callNow', { name: doctor.fullName })}
    </Button>
  );
}

/** What to do with the chosen doctor: call them, or call an available alternative. */
function ChosenAction({
  chosen,
  doctors,
  onCall,
  loading,
}: {
  chosen: DoctorOption;
  doctors: DoctorOption[];
  onCall: (doctor: DoctorOption) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (chosen.status === 'AVAILABLE') {
    return <CallButton doctor={chosen} onCall={onCall} loading={loading} />;
  }
  const sameSpecialty = availableAlternatives(doctors, chosen);
  const others = sameSpecialty.length === 0 ? doctors.filter((d) => d.status === 'AVAILABLE') : [];
  return (
    <div role="alert" className="space-y-2 rounded-lg bg-warning/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-warning">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {t(`triage.call.unavailable${chosen.status as 'BUSY' | 'ON_LEAVE'}`, {
          name: chosen.fullName,
        })}
      </p>
      <p className="text-foreground">
        {sameSpecialty.length > 0
          ? t('triage.call.alternatives')
          : others.length > 0
            ? t('triage.call.noAlternatives')
            : t('triage.call.nobodyAvailable')}
      </p>
      <div className="flex flex-wrap gap-2">
        {(sameSpecialty.length > 0 ? sameSpecialty : others).map((doctor) => (
          <CallButton key={doctor.id} doctor={doctor} onCall={onCall} loading={loading} />
        ))}
      </div>
    </div>
  );
}

// Below the triage: call a specific doctor, with an available one of the same
// specialty suggested when they are busy or on leave (task 2.16).
export function DoctorCallPanel({ visit }: { visit: ErVisit }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const { call, cancel } = useCalls(visit.id);
  const latest = visit.call;
  const pending = latest?.status === 'PENDING';
  const showPicker = !pending && (latest?.status !== 'ACCEPTED' || picking);
  const { data: doctors, isPending } = useQuery({
    queryKey: queryKeys.doctors,
    queryFn: async () => (await api.get<{ doctors: DoctorOption[] }>('/er/doctors')).data.doctors,
    enabled: showPicker,
  });

  const search = text.trim().toLowerCase();
  const shown = (doctors ?? []).filter(
    (doctor) => !search || `${doctor.fullName} ${doctor.specialty}`.toLowerCase().includes(search),
  );
  const chosen = doctors?.find((doctor) => doctor.id === chosenId) ?? null;

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <PhoneCall className="size-4" aria-hidden="true" />
          </span>
          {t('triage.call.title')}
        </h3>
        {showPicker && <p className="text-xs text-muted">{t('triage.call.hint')}</p>}
      </div>

      <AnimatePresence initial={false}>
        {latest && latest.status !== 'CANCELLED' && (
          <motion.div
            key={latest.id + latest.status}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={calm}
            role="status"
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm',
              latest.status === 'PENDING' && 'bg-info/10 text-info',
              latest.status === 'ACCEPTED' && 'bg-success/10 text-success',
              latest.status === 'DECLINED' && 'bg-danger/10 text-danger',
            )}
          >
            {latest.status === 'PENDING' ? (
              <BellRing
                className="size-5 shrink-0 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : latest.status === 'ACCEPTED' ? (
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <CircleX className="size-5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {latest.status === 'PENDING'
                  ? t('triage.call.pending', { name: latest.doctorName })
                  : latest.status === 'ACCEPTED'
                    ? t('triage.call.accepted', { name: latest.doctorName })
                    : t('triage.call.declined', { name: latest.doctorName })}
              </span>
              <span className="block text-xs opacity-80">
                {latest.status === 'DECLINED' && latest.declineReason
                  ? t('triage.call.declinedReason', { reason: latest.declineReason })
                  : t('triage.call.pendingSince', {
                      when: relativeTime(latest.createdAt, i18n.language),
                    })}
              </span>
            </span>
            {pending && (
              <Button
                size="sm"
                variant="ghost"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(latest.id)}
              >
                {t('triage.call.cancel')}
              </Button>
            )}
            {latest.status === 'ACCEPTED' && !picking && (
              <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                {t('triage.call.callAnother')}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {showPicker &&
        (isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : doctors?.length === 0 ? (
          <p className="text-sm text-muted">{t('triage.call.none')}</p>
        ) : (
          <div className="space-y-3">
            <Input
              label={t('triage.call.searchLabel')}
              placeholder={t('triage.call.search')}
              icon={<Search />}
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div
              role="radiogroup"
              aria-label={t('triage.call.title')}
              className="max-h-72 space-y-2 overflow-y-auto p-0.5"
            >
              {shown.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">{t('triage.call.noMatch')}</p>
              ) : (
                shown.map((doctor) => (
                  <DoctorRow
                    key={doctor.id}
                    doctor={doctor}
                    selected={doctor.id === chosenId}
                    onSelect={() => setChosenId(doctor.id)}
                  />
                ))
              )}
            </div>
            <AnimatePresence initial={false}>
              {chosen && doctors && (
                <motion.div
                  key={chosen.id + chosen.status}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={calm}
                  className="overflow-hidden"
                >
                  <ChosenAction
                    chosen={chosen}
                    doctors={doctors}
                    loading={call.isPending}
                    onCall={(doctor) =>
                      call.mutate(doctor, {
                        onSuccess: () => {
                          setChosenId(null);
                          setPicking(false);
                        },
                      })
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
    </Card>
  );
}
