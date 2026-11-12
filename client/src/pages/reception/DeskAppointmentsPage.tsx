import {
  addLocalDays,
  zonedDate,
  type AppointmentStatus,
  type AppointmentView,
  type DeskAppointment,
  type ReceptionPatient,
} from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Phone,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { BookingWizard } from '@/components/appointments/BookingWizard';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Modal, Spinner, StatusBadge, type StatusTone } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { hospitalFormat } from '@/lib/hospitalTime';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type Visits = { upcoming: AppointmentView[]; past: AppointmentView[] };
type Cancelling = { visit: AppointmentView; who: string };

const TONE: Record<AppointmentStatus, StatusTone> = {
  BOOKED: 'info',
  CANCELLED: 'neutral',
  COMPLETED: 'success',
  NO_SHOW: 'warning',
};

const cancellable = (visit: AppointmentView) =>
  visit.status === 'BOOKED' && Date.parse(visit.startsAt) > Date.now();

function CancelButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted hover:bg-danger/10 hover:text-danger"
      icon={<X className="size-4" />}
      onClick={onClick}
    >
      {t('appointments.cancel')}
    </Button>
  );
}

/** Choosing who to book for: the reception search (4.1), one tap to pick. */
function PatientPicker({ onPick }: { onPick: (patient: ReceptionPatient) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const needle = useDebouncedValue(search.trim(), 300);
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.receptionPatients(needle),
    queryFn: async () =>
      (
        await api.get<{ patients: ReceptionPatient[] }>('/reception/patients', {
          params: { search: needle },
        })
      ).data.patients,
  });
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-muted">{t('desk.pickHint')}</p>
      <Input
        label={t('reception.search')}
        icon={<Search />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {!data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t('reception.noneFound')}</p>
      ) : (
        <ul
          aria-label={t('reception.results')}
          className={cn('divide-y divide-border transition-opacity', isFetching && 'opacity-60')}
        >
          {data.map((patient) => (
            <li key={patient.patientId}>
              <button
                type="button"
                onClick={() => {
                  playSound('tap');
                  onPick(patient);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start transition-colors hover:bg-accent-soft/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {patientName(patient, t)}
                  </span>
                  <span className="block text-xs text-muted">
                    {patientFacts(patient, t)}
                    {patient.phone && (
                      <>
                        {' '}
                        · <bdi dir="ltr">{patient.phone}</bdi>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">{t('desk.pick')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The chosen patient: book them a visit, and see or cancel what they have coming. */
function PatientDesk({
  patient,
  onChange,
  onCancel,
}: {
  patient: ReceptionPatient;
  onChange: () => void;
  onCancel: (cancelling: Cancelling) => void;
}) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const [booking, setBooking] = useState(false);
  const name = patientName(patient, t);
  const { data } = useQuery({
    queryKey: queryKeys.patientVisits(patient.patientId),
    queryFn: async () => (await api.get<Visits>(`/appointments/patient/${patient.patientId}`)).data,
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted">
            {patientFacts(patient, t)}
            {patient.phone && (
              <>
                {' '}
                · <bdi dir="ltr">{patient.phone}</bdi>
              </>
            )}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onChange}>
          {t('desk.otherPatient')}
        </Button>
      </Card>

      <AnimatePresence mode="wait" initial={false}>
        {booking ? (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={calm}
          >
            <BookingWizard
              start={null}
              patient={{ id: patient.patientId, name }}
              onClose={() => setBooking(false)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="book"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Button
              className="w-full"
              icon={<CalendarPlus className="size-4" />}
              onClick={() => setBooking(true)}
            >
              {t('desk.bookFor', { name })}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <section aria-label={t('desk.theirVisits')} className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t('desk.theirVisits')}</h3>
        {!data ? (
          <Spinner />
        ) : data.upcoming.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-muted">{t('desk.noneUpcoming')}</Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {data.upcoming.map((visit) => (
                  <motion.li
                    key={visit.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={calm}
                    aria-label={`${visit.doctorName} · ${format.full(visit.startsAt)}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-medium text-foreground">
                        <bdi>{format.full(visit.startsAt)}</bdi>
                      </p>
                      <p className="text-xs text-muted">
                        {visit.doctorName}
                        {visit.department && ` · ${departmentLabel(visit.department, t)}`}
                      </p>
                    </div>
                    <CancelButton onClick={() => onCancel({ visit, who: name })} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

/** The hospital's visits of one day, in time order, refreshed live. */
function DayList({ onCancel }: { onCancel: (cancelling: Cancelling) => void }) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const today = zonedDate(new Date());
  const [date, setDate] = useState(today);
  const { data } = useQuery({
    queryKey: queryKeys.deskDay(date),
    queryFn: async () =>
      (
        await api.get<{ appointments: DeskAppointment[] }>('/appointments/day', {
          params: { date },
        })
      ).data.appointments,
  });
  const move = (days: number) => {
    playSound('toggle');
    setDate((current) => addLocalDays(current, days));
  };
  const booked = data?.filter((v) => v.status === 'BOOKED').length ?? 0;

  return (
    <section aria-label={t('desk.day')} className="space-y-3">
      <Card className="flex items-center gap-2 p-2">
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('desk.previousDay')}
          onClick={() => move(-1)}
        >
          <ChevronRight className="size-4 ltr:rotate-180" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-semibold text-foreground">{format.longDay(date)}</p>
          <p className="text-xs text-muted">
            {date === today ? t('desk.today') : t('desk.visits', { count: booked })}
            {date === today && ` · ${t('desk.visits', { count: booked })}`}
          </p>
        </div>
        {date !== today && (
          <Button size="sm" variant="outline" onClick={() => setDate(today)}>
            {t('desk.today')}
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-label={t('desk.nextDay')} onClick={() => move(1)}>
          <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
        </Button>
      </Card>

      {!data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">
          <CalendarDays className="mx-auto mb-2 size-8 text-muted/60" aria-hidden="true" />
          {t('desk.noneThatDay')}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul aria-label={t('desk.dayVisits')} className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {data.map((visit) => {
                const who = patientName({ ...visit.patient, gender: null, dateOfBirth: null }, t);
                return (
                  <motion.li
                    key={visit.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={calm}
                    aria-label={`${format.time(visit.startsAt)} · ${who}`}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-opacity',
                      visit.status === 'CANCELLED' && 'opacity-60',
                    )}
                  >
                    <bdi className="w-14 shrink-0 text-sm font-bold text-accent tabular-nums">
                      {format.time(visit.startsAt)}
                    </bdi>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-medium text-foreground">{who}</p>
                      <p className="text-xs text-muted">
                        {visit.doctorName}
                        {visit.department && ` · ${departmentLabel(visit.department, t)}`}
                      </p>
                      {visit.patient.phone && (
                        <a
                          href={`tel:${visit.patient.phone.replace(/\s/g, '')}`}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
                        >
                          <Phone className="size-3" aria-hidden="true" />
                          <bdi dir="ltr">{visit.patient.phone}</bdi>
                        </a>
                      )}
                    </div>
                    <StatusBadge tone={TONE[visit.status]}>
                      {t(`appointments.status.${visit.status}`)}
                    </StatusBadge>
                    {cancellable(visit) && (
                      <CancelButton onClick={() => onCancel({ visit, who })} />
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Card>
      )}
    </section>
  );
}

// Reception's appointments (task 4.2): pick a patient (registered at the desk
// or with an account) and book them a visit with the same steps a patient
// uses; the day's visits beside it, live, with a phone number to call and a
// cancel for the ones still to come.
export function DeskAppointmentsPage() {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState<ReceptionPatient | null>(null);
  const [cancelling, setCancelling] = useState<Cancelling | null>(null);
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      playSound('success');
      notify.success(t('appointments.cancelled'));
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('desk.title')}</h2>
        <p className="text-sm text-muted">{t('desk.description')}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <motion.section {...enter(1)} aria-label={t('desk.forPatient')} className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarPlus className="size-5 text-accent" aria-hidden="true" />
            {t('desk.forPatient')}
          </h3>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={patient?.patientId ?? 'pick'}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={calm}
            >
              {patient ? (
                <PatientDesk
                  patient={patient}
                  onChange={() => setPatient(null)}
                  onCancel={setCancelling}
                />
              ) : (
                <PatientPicker onPick={setPatient} />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.section>

        <motion.div {...enter(2)} className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarDays className="size-5 text-accent" aria-hidden="true" />
            {t('desk.day')}
          </h3>
          <DayList onCancel={setCancelling} />
        </motion.div>
      </div>

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={t('appointments.cancelTitle')}
        description={
          cancelling
            ? t('desk.cancelBody', {
                name: cancelling.who,
                doctor: cancelling.visit.doctorName,
                when: format.full(cancelling.visit.startsAt),
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
              onClick={() => cancelling && cancel.mutate(cancelling.visit.id)}
            >
              {t('appointments.confirmCancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
