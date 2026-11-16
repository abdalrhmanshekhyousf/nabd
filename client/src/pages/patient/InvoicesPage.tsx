import type { ChargeView, InvoiceView } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { chargeLabel, INVOICE_TONE } from '@/components/invoices/chargeLabel';
import { PrintInvoiceButton } from '@/components/invoices/InvoiceSheet';
import { Card, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { enter } from '@/lib/motion';

type Mine = { invoices: InvoiceView[]; open: ChargeView[] };

// The patient's invoices (task 4.15): each one with what it covers and what is
// still due, to print or save as PDF; and the services not invoiced yet.
export function MyInvoicesPage() {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const { data } = useQuery({
    queryKey: queryKeys.myInvoices,
    queryFn: async () => (await api.get<Mine>('/patients/me/invoices')).data,
  });
  const due = data?.invoices.reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0) ?? 0;
  const openTotal = data?.open.reduce((sum, charge) => sum + charge.total, 0) ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('myInvoices.title')}</h2>
        <p className="text-sm text-muted">{t('myInvoices.description')}</p>
      </motion.div>
      {!data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.div {...enter(1)} className="grid gap-3 sm:grid-cols-2">
            <Card className="space-y-1 p-4">
              <p className="text-xs text-muted">{t('myInvoices.due')}</p>
              <bdi className="block text-2xl font-bold text-foreground tabular-nums">
                {money(due)}
              </bdi>
            </Card>
            <Card className="space-y-1 p-4">
              <p className="text-xs text-muted">{t('myInvoices.notInvoiced')}</p>
              <bdi className="block text-2xl font-bold text-foreground tabular-nums">
                {money(openTotal)}
              </bdi>
            </Card>
          </motion.div>

          <motion.section {...enter(2)} aria-label={t('myInvoices.list')} className="space-y-3">
            <h3 className="font-semibold text-foreground">{t('myInvoices.list')}</h3>
            {data.invoices.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
                <Receipt className="size-8 text-muted/60" aria-hidden="true" />
                {t('myInvoices.none')}
              </Card>
            ) : (
              <ul className="space-y-3">
                {data.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    aria-label={t('invoices.number', { number: invoice.number })}
                  >
                    <Card className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="font-semibold text-foreground">
                            {t('invoices.number', { number: invoice.number })}
                          </p>
                          <p className="text-xs text-muted">
                            {date.format(new Date(invoice.issuedAt))}
                          </p>
                        </div>
                        <StatusBadge tone={INVOICE_TONE[invoice.status]}>
                          {t(`invoices.status.${invoice.status}`)}
                        </StatusBadge>
                        <PrintInvoiceButton invoice={invoice} />
                      </div>
                      <ul className="space-y-1 text-sm">
                        {invoice.items.map((item) => (
                          <li key={item.id} className="flex justify-between gap-3">
                            <span className="text-muted">{chargeLabel(item, t)}</span>
                            <bdi className="tabular-nums">{money(item.total)}</bdi>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm">
                        <span>
                          {t('invoices.total')}{' '}
                          <bdi className="font-semibold tabular-nums">{money(invoice.total)}</bdi>
                        </span>
                        <span>
                          {t('invoices.due')}{' '}
                          <bdi className="font-semibold tabular-nums">
                            {money(Math.max(0, invoice.total - invoice.paid))}
                          </bdi>
                        </span>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {data.open.length > 0 && (
            <motion.section
              {...enter(3)}
              aria-label={t('myInvoices.notInvoiced')}
              className="space-y-3"
            >
              <h3 className="font-semibold text-foreground">{t('myInvoices.notInvoiced')}</h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border text-sm">
                  {data.open.map((charge) => (
                    <li key={charge.id} className="flex justify-between gap-3 px-4 py-2.5">
                      <span className="text-foreground">{chargeLabel(charge, t)}</span>
                      <bdi className="tabular-nums">{money(charge.total)}</bdi>
                    </li>
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
