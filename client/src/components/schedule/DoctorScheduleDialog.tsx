import type { DoctorScheduleView, ScheduleDay } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Modal, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Vacations } from './Vacations';
import { WeekEditor } from './WeekEditor';

function Loaded({
  doctorId,
  name,
  onDone,
}: {
  doctorId: string;
  name: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.doctorSchedule(doctorId),
    queryFn: async () => (await api.get<DoctorScheduleView>(`/staff/${doctorId}/schedule`)).data,
  });
  const save = useMutation({
    mutationFn: async (days: ScheduleDay[]) =>
      (await api.put<DoctorScheduleView>(`/staff/${doctorId}/schedule`, { days })).data,
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKeys.doctorSchedule(doctorId), fresh);
      notify.success(t('schedule.savedFor', { name }));
      onDone();
    },
  });
  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Vacations vacations={data.vacations} doctorId={doctorId} />
      <p className="border-t border-border pt-4 text-sm text-muted">
        {t('schedule.adminHint', { minutes: t('schedule.minutes', { count: data.visitMinutes }) })}
      </p>
      <WeekEditor
        saved={data.days}
        visitMinutes={data.visitMinutes}
        saving={save.isPending}
        onSave={(days) => save.mutate(days)}
      />
    </div>
  );
}

// The admin sets a doctor's working days and hours (task 3.19).
export function DoctorScheduleDialog({
  doctor,
  onClose,
}: {
  doctor: { id: string; fullName: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={doctor !== null}
      onClose={onClose}
      title={doctor ? t('schedule.dialog', { name: doctor.fullName }) : ''}
      size="lg"
    >
      {doctor && (
        <Loaded key={doctor.id} doctorId={doctor.id} name={doctor.fullName} onDone={onClose} />
      )}
    </Modal>
  );
}
