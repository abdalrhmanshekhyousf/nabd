import type { AppointmentStatus, AppointmentView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, CalendarDays, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { BookingWizard, type BookingStart } from '@/components/appointments/BookingWizard';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Button, Card, Modal, Spinner, StatusBadge, type StatusTone } from '@/components/ui';
import { api } from '@/lib/api';
import { hospitalFormat } from '@/lib/hospitalTime';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';

type Mine = { upcoming: AppointmentView[]; past: AppointmentView[] };

const TONE: Record<AppointmentStatus, StatusTone> = {
  BOOKED: 'info',
  CANCELLED: 'neutral',
  COMPLETED: 'success',
  NO_SHOW: 'warning',
};

function Visit({
  visit,
  onCancel,
  onRebook,
}: {
  visit: AppointmentView;
  onCancel?: () => void;
  onRebook?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={calm}
      aria-label={`${visit.doctorName} · ${format.full(visit.startsAt)}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-56 space-y-0.5">
        <p className="font-semibold text-foreground">
          <bdi>{format.full(visit.startsAt)}</bdi>
        </p>
        <p className="text-sm text-muted">
          {visit.doctorName}
          {visit.department && ` · ${departmentLabel(visit.department, t)}`}
        </p>
        {visit.reason && <p className="text-xs text-muted">{visit.reason}</p>}
        {visit.status === 'CANCELLED' && visit.cancelReason && (
          <p className="text-xs text-warning">
            {t(
              `appointments.cancelReason.${visit.cancelReason === 'DOCTOR_LEAVE' ? 'DOCTOR_LEAVE' : 'OTHER'}`,
            )}
          </p>
        )}
      </div>
      <StatusBadge tone={TONE[visit.status]}>
        {t(`appointments.status.${visit.status}`)}
      </StatusBadge>
      {onCancel && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted hover:bg-danger/10 hover:text-danger"
          icon={<X className="size-4" />}
          onClick={onCancel}
        >
          {t('appointments.cancel')}
        </Button>
      )}
      {onRebook && (
        <Button
          size="sm"
          variant="outline"
          icon={<RotateCcw className="size-4" />}
          onClick={onRebook}
        >
          {t('appointments.rebook')}
        </Button>
      )}
    </motion.li>
  );
}

// The patient's appointments (task 3.22): book a visit (department, doctor,
// slot), see what is coming and what happened, cancel a coming one, and book
// again after a visit the doctor's vacation cancelled (3.21).
export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [start, setStart] = useState<BookingStart>(null);
  const [cancelling, setCancelling] = useState<AppointmentView | null>(null);
  const booking = params.get('book') === '1';
  const setBooking = (on: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (on) next.set('book', '1');
        else next.delete('book');
        return next;
      },
      { replace: true },
    );

  const { data } = useQuery({
    queryKey: queryKeys.myAppointments,
    queryFn: async () => (await api.get<Mine>('/appointments/mine')).data,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      notify.success(t('appointments.cancelled'));
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myAppointments });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('appointments.title')}</h2>
          <p className="text-sm text-muted">{t('appointments.description')}</p>
        </div>
        {!booking && (
          <Button
            icon={<CalendarPlus className="size-4" />}
            onClick={() => {
              setStart(null);
              setBooking(true);
            }}
          >
            {t('appointments.book')}
          </Button>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {booking && (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={calm}
          >
            <BookingWizard
              key={start?.doctor.id ?? 'new'}
              start={start}
              onClose={() => {
                setStart(null);
                setBooking(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.section
            {...enter(1)}
            aria-label={t('appointments.upcoming')}
            className="space-y-3"
          >
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <CalendarDays className="size-5 text-accent" aria-hidden="true" />
              {t('appointments.upcoming')}
            </h3>
            {data.upcoming.length === 0 ? (
              <Card className="px-6 py-8 text-center text-sm text-muted">
                {t('appointments.noneUpcoming')}
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {data.upcoming.map((visit) => (
                      <Visit key={visit.id} visit={visit} onCancel={() => setCancelling(visit)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            )}
          </motion.section>

          {data.past.length > 0 && (
            <motion.section {...enter(2)} aria-label={t('appointments.past')} className="space-y-3">
              <h3 className="font-semibold text-foreground">{t('appointments.past')}</h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {data.past.map((visit) => (
                    <Visit
                      key={visit.id}
                      visit={visit}
                      onRebook={
                        visit.status === 'CANCELLED' && visit.doctorId && visit.department
                          ? () => {
                              setStart({
                                department: visit.department!,
                                doctor: { id: visit.doctorId!, fullName: visit.doctorName },
                              });
                              setBooking(true);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          : undefined
                      }
                    />
                  ))}
                </ul>
              </Card>
            </motion.section>
          )}
        </>
      )}

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={t('appointments.cancelTitle')}
        description={
          cancelling
            ? t('appointments.cancelBody', {
                doctor: cancelling.doctorName,
                when: format.full(cancelling.startsAt),
              })
            : ''
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              {t('appointments.keep')}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancelling && cancel.mutate(cancelling.id)}
            >
              {t('appointments.confirmCancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
