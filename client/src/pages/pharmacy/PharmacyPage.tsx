import type { PharmacyPrescription } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Clock, Pill, ShieldAlert, Sparkles, Stethoscope } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { patientFacts, patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Modal, Select, Spinner } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { readCount } from '@/lib/numbers';
import { playSound } from '@/lib/sound';

const since = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

/** The value of the "not available" choice in each medicine's select. */
const NONE = '';

function PrescriptionCard({
  prescription,
  action,
}: {
  prescription: PharmacyPrescription;
  action?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow(15_000);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const done = prescription.status === 'DISPENSED';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={calm}
    >
      <Card
        aria-label={patientName(prescription.patient, t)}
        className={cn(
          'flex h-full flex-col gap-3 border-s-4 p-4',
          done ? 'border-s-success' : 'border-s-accent',
        )}
      >
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">{patientName(prescription.patient, t)}</p>
          <p className="text-xs text-muted">{patientFacts(prescription.patient, t)}</p>
        </div>
        {prescription.allergies && (
          <p className="flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger">
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            {t('pharmacy.allergies', { allergies: prescription.allergies })}
          </p>
        )}
        <ul className="space-y-1.5">
          {prescription.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <Pill className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-foreground">
                  <span className="font-medium">{item.drugName}</span> · {item.dose}
                </p>
                <p className="text-xs text-muted">
                  {item.frequency}
                  {item.durationDays
                    ? ` · ${t('pharmacy.days', { count: item.durationDays })}`
                    : ''}
                  {item.instructions ? ` · ${item.instructions}` : ''}
                </p>
                {done && (
                  <p className={cn('text-xs', item.dispensed ? 'text-success' : 'text-warning')}>
                    {item.dispensed ? t('pharmacy.gave', item.dispensed) : t('pharmacy.notGiven')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {prescription.notes && <p className="text-xs text-muted">{prescription.notes}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Stethoscope className="size-3.5" aria-hidden="true" />
            {t('pharmacy.by', { name: prescription.doctorName })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            <bdi>{time.format(new Date(prescription.createdAt))}</bdi>
            {!done && <span>· {since(prescription.createdAt, now)}</span>}
          </span>
          {done && prescription.dispensedByName && (
            <span className="text-success">
              {t('pharmacy.dispensedBy', { name: prescription.dispensedByName })}
            </span>
          )}
        </p>
        {action}
      </Card>
    </motion.li>
  );
}

type Line = { itemId: string; count: string };

function DispenseForm({
  prescription,
  onDone,
}: {
  prescription: PharmacyPrescription;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Each medicine starts on its best match, one unit; "not available" when nothing matches.
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      prescription.items.map((item) => [
        item.id,
        { itemId: item.matches[0]?.id ?? NONE, count: item.matches[0] ? '1' : '0' },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (id: string, change: Partial<Line>) =>
    setLines((current) => ({ ...current, [id]: { ...current[id]!, ...change } }));

  const short = prescription.items.find((item) => {
    const line = lines[item.id]!;
    const match = item.matches.find((m) => m.id === line.itemId);
    return match && readCount(line.count) > match.quantity;
  });

  const dispense = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ lowItems: string[] }>(
          `/pharmacy/prescriptions/${prescription.id}/dispense`,
          {
            lines: prescription.items.map((item) => {
              const line = lines[item.id]!;
              return line.itemId === NONE
                ? { prescriptionItemId: item.id, inventoryItemId: null, quantity: 0 }
                : {
                    prescriptionItemId: item.id,
                    inventoryItemId: line.itemId,
                    quantity: readCount(line.count),
                  };
            }),
          },
          { skipErrorToast: true },
        )
      ).data,
    onSuccess: ({ lowItems }) => {
      notify.success(t('pharmacy.dispensed', { patient: patientName(prescription.patient, t) }));
      if (lowItems.length) notify.warning(t('pharmacy.nowLow', { items: lowItems.join('، ') }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.pharmacy });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onDone();
    },
    onError: (failure) => {
      setError(describeApiError(failure).message);
      playSound('error');
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const bad = prescription.items.some((item) => {
          const line = lines[item.id]!;
          const count = readCount(line.count);
          return line.itemId !== NONE && (!Number.isInteger(count) || count < 1);
        });
        if (bad || short) {
          setError(bad ? t('validation.invalid') : null);
          return playSound('error');
        }
        dispense.mutate();
      }}
    >
      {prescription.allergies && (
        <p
          role="note"
          className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
        >
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          {t('pharmacy.allergyReminder', { allergies: prescription.allergies })}
        </p>
      )}
      <ul className="space-y-3">
        {prescription.items.map((item) => {
          const line = lines[item.id]!;
          const match = item.matches.find((m) => m.id === line.itemId);
          const tooMuch = match && readCount(line.count) > match.quantity;
          return (
            <li
              key={item.id}
              aria-label={item.drugName}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <p className="text-sm text-foreground">
                <span className="font-semibold">{item.drugName}</span> · {item.dose} ·{' '}
                <span className="text-muted">{item.frequency}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
                <Select
                  label={t('pharmacy.from')}
                  options={[
                    ...item.matches.map((m) => ({
                      value: m.id,
                      label: t('pharmacy.inStock', {
                        name: m.name,
                        quantity: m.quantity,
                        unit: m.unit,
                      }),
                    })),
                    {
                      value: NONE,
                      label: item.matches.length
                        ? t('pharmacy.notAvailable')
                        : t('pharmacy.noMatch'),
                    },
                  ]}
                  value={line.itemId}
                  onChange={(event) => {
                    playSound('toggle');
                    const itemId = event.target.value;
                    set(item.id, {
                      itemId,
                      count: itemId === NONE ? '0' : line.count === '0' ? '1' : line.count,
                    });
                    setError(null);
                  }}
                />
                <Input
                  label={t('pharmacy.quantity')}
                  inputMode="numeric"
                  dir="ltr"
                  disabled={line.itemId === NONE}
                  value={line.count}
                  onChange={(event) => set(item.id, { count: event.target.value })}
                  error={
                    tooMuch
                      ? t('pharmacy.tooMuch', { quantity: match.quantity, unit: match.unit })
                      : undefined
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-danger"
          >
            {error}
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
          loading={dispense.isPending}
          disabled={Boolean(short)}
          icon={<CheckCheck className="size-4" />}
        >
          {t('pharmacy.confirm')}
        </Button>
      </div>
    </form>
  );
}

// The pharmacist's board (task 3.10): prescriptions waiting, oldest first,
// with the patient's allergies; dispensing picks the stock for each medicine,
// takes it out of stock and records it in the patient's file.
export function PharmacyPage() {
  const { t } = useTranslation();
  const [dispensing, setDispensing] = useState<PharmacyPrescription | null>(null);
  const { data: prescriptions = [], isPending } = useQuery({
    queryKey: queryKeys.pharmacy,
    queryFn: async () =>
      (await api.get<{ prescriptions: PharmacyPrescription[] }>('/pharmacy/prescriptions')).data
        .prescriptions,
  });
  const waiting = prescriptions.filter((p) => p.status === 'PENDING');
  const done = prescriptions.filter((p) => p.status === 'DISPENSED');

  const section = (title: string, list: PharmacyPrescription[], withAction: boolean) =>
    list.length > 0 && (
      <section aria-label={title} className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          {title}
          <span className="rounded-full bg-surface-muted px-2 text-xs text-muted tabular-nums">
            {list.length}
          </span>
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((prescription) => (
              <PrescriptionCard
                key={prescription.id}
                prescription={prescription}
                action={
                  withAction && (
                    <Button
                      className="mt-auto w-full"
                      icon={<Pill className="size-4" />}
                      onClick={() => setDispensing(prescription)}
                    >
                      {t('pharmacy.dispense')}
                    </Button>
                  )
                }
              />
            ))}
          </AnimatePresence>
        </ul>
      </section>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('pharmacy.title')}</h2>
        <p className="text-sm text-muted">{t('pharmacy.description')}</p>
      </motion.div>
      {isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        waiting.length === 0 && (
          <motion.div {...enter(1)}>
            <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Sparkles className="size-8 text-success" aria-hidden="true" />
              <p className="font-semibold text-foreground">{t('pharmacy.empty')}</p>
              <p className="text-sm text-muted">{t('pharmacy.emptyHint')}</p>
            </Card>
          </motion.div>
        )
      )}
      <motion.div {...enter(1)} className="space-y-6">
        {section(t('pharmacy.waiting'), waiting, true)}
        {section(t('pharmacy.done'), done, false)}
      </motion.div>
      <Modal
        open={dispensing !== null}
        onClose={() => setDispensing(null)}
        title={
          dispensing ? t('pharmacy.dialog', { patient: patientName(dispensing.patient, t) }) : ''
        }
        size="lg"
      >
        {dispensing && (
          <DispenseForm
            key={dispensing.id}
            prescription={dispensing}
            onDone={() => setDispensing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
