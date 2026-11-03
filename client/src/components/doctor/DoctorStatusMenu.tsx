import { DOCTOR_STATUSES, type DoctorStatus } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Popover } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calmSpring } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { DOCTOR_STATUS_DOT } from './doctorStatusStyles';

type StatusData = { status: DoctorStatus };

function Dot({ status, className }: { status: DoctorStatus; className?: string }) {
  return (
    <motion.span
      key={status}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={calmSpring}
      aria-hidden="true"
      className={cn(
        'relative flex size-2.5 shrink-0 rounded-full',
        DOCTOR_STATUS_DOT[status],
        className,
      )}
    >
      {/* A soft pulse while available, like a monitor that is on. */}
      {status === 'AVAILABLE' && (
        <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-40 motion-reduce:hidden" />
      )}
    </motion.span>
  );
}

// The doctor's status button in the top bar (task 2.5): available, busy or on
// leave. The change shows at once and reaches the rest of the hospital live.
export function DoctorStatusMenu() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.doctorStatus,
    queryFn: async () => (await api.get<StatusData>('/doctors/me/status')).data,
  });

  const change = useMutation({
    mutationFn: (status: DoctorStatus) => api.patch('/doctors/me/status', { status }),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.doctorStatus });
      const before = queryClient.getQueryData<StatusData>(queryKeys.doctorStatus);
      queryClient.setQueryData<StatusData>(queryKeys.doctorStatus, { status });
      return { before };
    },
    onError: (_error, _status, context) => {
      if (context?.before) queryClient.setQueryData(queryKeys.doctorStatus, context.before);
    },
    onSuccess: (_result, status) =>
      notify.success(t('doctorStatus.changed', { status: t(`doctorStatus.${status}`) })),
  });

  if (!data) return null;
  const current = data.status;

  return (
    <Popover
      label={t('doctorStatus.current', { status: t(`doctorStatus.${current}`) })}
      triggerClassName="w-auto gap-2 px-2.5 text-foreground sm:px-3"
      panelClassName="sm:w-72"
      trigger={
        <>
          <Dot status={current} />
          <span className="hidden text-sm font-medium sm:inline">
            {t(`doctorStatus.${current}`)}
          </span>
        </>
      }
    >
      {(close) => (
        <div className="p-1.5">
          <p className="px-2.5 pt-1.5 pb-2 text-xs font-semibold text-muted">
            {t('doctorStatus.choose')}
          </p>
          <div role="radiogroup" aria-label={t('doctorStatus.label')} className="space-y-0.5">
            {DOCTOR_STATUSES.map((status) => {
              const selected = status === current;
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    close();
                    if (!selected) change.mutate(status);
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                    selected && 'bg-accent-soft/60',
                  )}
                >
                  <Dot status={status} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {t(`doctorStatus.${status}`)}
                    </span>
                    <span className="block text-xs text-muted">
                      {t(`doctorStatus.hint.${status}`)}
                    </span>
                  </span>
                  {selected && (
                    <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}
