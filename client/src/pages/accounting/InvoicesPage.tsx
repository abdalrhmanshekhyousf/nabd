import type { ChargeView, InvoiceView } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FilePlus2, Receipt, Search, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { chargeLabel, INVOICE_TONE } from '@/components/invoices/chargeLabel';
import { PrintInvoiceButton } from '@/components/invoices/InvoiceSheet';
import { patientName } from '@/components/patients/patientDisplay';
import { Button, Card, Input, Spinner, StatusBadge } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api, describeApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/sound';

type Who = { id: string; fullName: string | null; isAnonymous: boolean; phone: string | null };
type Account = { patient: Who; openTotal: number; openCount: number };
type Detail = { patient: Who; open: ChargeView[]; invoices: InvoiceView[] };

const nameOf = (patient: Who, t: Parameters<typeof patientName>[1]) =>
  patientName({ ...patient, gender: null, dateOfBirth: null }, t);

function Accounts({ chosen, onPick }: { chosen: string | null; onPick: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const needle = useDebouncedValue(search.trim(), 300);
  const { data } = useQuery({
    queryKey: queryKeys.accounts(needle),
    queryFn: async () =>
      (await api.get<{ accounts: Account[] }>('/invoices/accounts', { params: { search: needle } }))
        .data.accounts,
  });
  return (
    <Card className="space-y-3 p-4">
      <Input
        label={t('invoices.search')}
        icon={<Search />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {!data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t('invoices.noneOpen')}</p>
      ) : (
        <ul aria-label={t('invoices.accounts')} className="space-y-1">
          {data.map(({ patient, openTotal, openCount }) => (
            <li key={patient.id}>
              <button
                type="button"
                aria-pressed={chosen === patient.id}
                onClick={() => {
                  playSound('tap');
                  onPick(patient.id);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start transition-colors',
                  chosen === patient.id ? 'bg-accent-soft' : 'hover:bg-accent-soft/50',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {nameOf(patient, t)}
                  </span>
                  <span className="block text-xs text-muted">
                    {openCount > 0
                      ? t('invoices.openCount', { count: openCount })
                      : t('invoices.settled')}
                  </span>
                </span>
                {openTotal > 0 && (
                  <bdi className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatMoney(openTotal, i18n.language)}
                  </bdi>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccountDetail({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const { data } = useQuery({
    queryKey: queryKeys.account(patientId),
    queryFn: async () => (await api.get<Detail>(`/invoices/accounts/${patientId}`)).data,
  });
  const issue = useMutation({
    mutationFn: async (itemIds: string[]) =>
      (
        await api.post<{ invoice: InvoiceView }>(
          '/invoices',
          { patientId, itemIds },
          { skipErrorToast: true },
        )
      ).data.invoice,
    onSuccess: (invoice) => {
      playSound('success');
      notify.success(t('invoices.issued', { number: invoice.number }));
      setPicked(null);
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (failure) => {
      playSound('error');
      notify.error(describeApiError(failure).message);
    },
  });
  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  const chosen = picked ?? new Set(data.open.map((charge) => charge.id));
  const chosenTotal = data.open
    .filter((charge) => chosen.has(charge.id))
    .reduce((sum, charge) => sum + charge.total, 0);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-foreground">{nameOf(data.patient, t)}</h3>
      <section aria-label={t('invoices.open')} className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">{t('invoices.open')}</h4>
        {data.open.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-muted">
            {t('invoices.nothingOpen')}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {data.open.map((charge) => (
                <li key={charge.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent)]"
                      checked={chosen.has(charge.id)}
                      onChange={() => toggle(charge.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground">{chargeLabel(charge, t)}</span>
                      <span className="block text-xs text-muted">
                        {date.format(new Date(charge.createdAt))}
                        {charge.quantity > 1 &&
                          ` · ${charge.quantity} × ${money(charge.unitPrice)}`}
                      </span>
                    </span>
                    <bdi className="shrink-0 tabular-nums">{money(charge.total)}</bdi>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/50 px-4 py-3">
              <p className="text-sm text-muted">
                {t('invoices.selected')}{' '}
                <bdi className="font-bold text-foreground tabular-nums">{money(chosenTotal)}</bdi>
              </p>
              <Button
                icon={<FilePlus2 className="size-4" />}
                disabled={chosen.size === 0}
                loading={issue.isPending}
                onClick={() => issue.mutate([...chosen])}
              >
                {t('invoices.issue')}
              </Button>
            </div>
          </Card>
        )}
      </section>

      <section aria-label={t('invoices.list')} className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">{t('invoices.list')}</h4>
        {data.invoices.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-muted">
            {t('invoices.noInvoices')}
          </Card>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {data.invoices.map((invoice) => (
                <motion.li
                  key={invoice.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={calm}
                  aria-label={t('invoices.number', { number: invoice.number })}
                >
                  <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                    <Receipt className="size-5 shrink-0 text-accent" aria-hidden="true" />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-semibold text-foreground">
                        {t('invoices.number', { number: invoice.number })}
                      </p>
                      <p className="text-xs text-muted">
                        {date.format(new Date(invoice.issuedAt))} ·{' '}
                        <bdi className="tabular-nums">{money(invoice.total)}</bdi>
                      </p>
                    </div>
                    <StatusBadge tone={INVOICE_TONE[invoice.status]}>
                      {t(`invoices.status.${invoice.status}`)}
                    </StatusBadge>
                    <PrintInvoiceButton invoice={invoice} />
                  </Card>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}

// The accountant's invoices (task 4.13): every service lands on the patient's
// account (4.12); here the accountant picks a patient, issues an invoice for
// their open charges (all or some), and prints it with the hospital's logo.
export function InvoicesPage() {
  const { t } = useTranslation();
  const [patientId, setPatientId] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('invoices.title')}</h2>
        <p className="text-sm text-muted">{t('invoices.description')}</p>
      </motion.div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start">
        <motion.div {...enter(1)}>
          <Accounts chosen={patientId} onPick={setPatientId} />
        </motion.div>
        <motion.div {...enter(2)}>
          {patientId ? (
            <AccountDetail key={patientId} patientId={patientId} />
          ) : (
            <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-muted">
              <Receipt className="size-8 text-muted/60" aria-hidden="true" />
              {t('invoices.pick')}
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
