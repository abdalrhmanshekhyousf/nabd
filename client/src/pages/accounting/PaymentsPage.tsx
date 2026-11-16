import { PAYMENT_METHODS, type InvoiceView, type PaymentMethod } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, Search, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { INVOICE_TONE } from '@/components/invoices/chargeLabel';
import { PrintInvoiceButton } from '@/components/invoices/InvoiceSheet';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Modal, Spinner, StatusBadge } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

function PayDialog({ invoice, onClose }: { invoice: InvoiceView | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const due = invoice ? invoice.total - invoice.paid : 0;
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pay = useMutation({
    mutationFn: async () =>
      api.post(
        `/invoices/${invoice!.id}/payments`,
        { amount, method, note },
        { skipErrorToast: true },
      ),
    onSuccess: () => {
      playSound('success');
      notify.success(t('payments.recorded'));
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (failure) => {
      playSound('error');
      setError(describeApiError(failure).message);
    },
  });
  return (
    <Modal
      open={invoice !== null}
      onClose={onClose}
      title={invoice ? t('payments.payTitle', { number: invoice.number }) : ''}
      description={invoice ? t('payments.due', { amount: formatMoney(due, i18n.language) }) : ''}
      size="sm"
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(amount);
          if (!(value > 0) || value > due) {
            setError(t('payments.badAmount'));
            playSound('error');
            return;
          }
          setError(null);
          pay.mutate();
        }}
      >
        <Input
          label={t('payments.amount')}
          type="number"
          min={1}
          max={due}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <div role="radiogroup" aria-label={t('payments.method')} className="flex gap-2">
          {PAYMENT_METHODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => {
                playSound('toggle');
                setMethod(value);
              }}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                method === value
                  ? 'border-accent bg-accent-soft font-semibold text-accent'
                  : 'border-border hover:border-accent',
              )}
            >
              {t(`payments.methods.${value}`)}
            </button>
          ))}
        </div>
        <Input
          label={t('payments.note')}
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          loading={pay.isPending}
          icon={<Banknote className="size-4" />}
        >
          {t('payments.record')}
        </Button>
      </form>
    </Modal>
  );
}

// Payments (task 4.14): the invoices still owed, oldest first; take a payment
// (all or part, cash, card or transfer) and the invoice moves to partly paid,
// then paid. The paid ones are kept apart.
export function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const [status, setStatus] = useState<'OWED' | 'PAID'>('OWED');
  const [search, setSearch] = useState('');
  const needle = useDebouncedValue(search.trim(), 300);
  const [paying, setPaying] = useState<InvoiceView | null>(null);
  const { data } = useQuery({
    queryKey: queryKeys.invoices(status, needle),
    queryFn: async () =>
      (
        await api.get<{ invoices: InvoiceView[] }>('/invoices', {
          params: { status, search: needle },
        })
      ).data.invoices,
  });
  const owedTotal = data?.reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h2 className="text-xl font-bold text-foreground">{t('payments.title')}</h2>
          <p className="text-sm text-muted">{t('payments.description')}</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-muted p-1">
          {(['OWED', 'PAID'] as const).map((name) => (
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
              {t(`payments.tabs.${name}`)}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div {...enter(1)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          label={t('payments.search')}
          icon={<Search />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {status === 'OWED' && data && (
          <Card className="px-4 py-2.5 text-sm">
            <span className="text-muted">{t('payments.owedTotal')} </span>
            <bdi className="font-bold text-foreground tabular-nums">{money(owedTotal)}</bdi>
          </Card>
        )}
      </motion.div>

      {!data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted">
          <Wallet className="size-8 text-muted/60" aria-hidden="true" />
          {t(status === 'OWED' ? 'payments.noneOwed' : 'payments.nonePaid')}
        </Card>
      ) : (
        <ul aria-label={t(`payments.tabs.${status}`)} className="space-y-2">
          <AnimatePresence initial={false}>
            {data.map((invoice) => (
              <motion.li
                key={invoice.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={calm}
                aria-label={t('invoices.number', { number: invoice.number })}
              >
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {t('invoices.number', { number: invoice.number })} ·{' '}
                      {patientName({ ...invoice.patient, gender: null, dateOfBirth: null }, t)}
                    </p>
                    <p className="text-xs text-muted">
                      {date.format(new Date(invoice.issuedAt))} · {t('invoices.total')}{' '}
                      <bdi className="tabular-nums">{money(invoice.total)}</bdi>
                      {invoice.paid > 0 && invoice.status !== 'PAID' && (
                        <>
                          {' '}
                          · {t('invoices.due')}{' '}
                          <bdi className="tabular-nums">{money(invoice.total - invoice.paid)}</bdi>
                        </>
                      )}
                    </p>
                  </div>
                  <StatusBadge tone={INVOICE_TONE[invoice.status]}>
                    {t(`invoices.status.${invoice.status}`)}
                  </StatusBadge>
                  <PrintInvoiceButton invoice={invoice} />
                  {invoice.status !== 'PAID' && (
                    <Button
                      size="sm"
                      icon={<Banknote className="size-4" />}
                      onClick={() => setPaying(invoice)}
                    >
                      {t('payments.pay')}
                    </Button>
                  )}
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <PayDialog key={paying?.id ?? 'none'} invoice={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
