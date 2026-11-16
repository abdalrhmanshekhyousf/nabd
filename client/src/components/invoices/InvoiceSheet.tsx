import type { InvoiceView } from '@nabd/shared';
import { Printer } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { HospitalLogo } from '@/components/layout/HospitalBrand';
import { patientName } from '@/components/patients/patientDisplay';
import { PrintSheet } from '@/components/print/PrintSheet';
import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { useSessionStore } from '@/stores/sessionStore';
import { chargeLabel } from './chargeLabel';

/** The printed invoice: the hospital's logo and name on top, lines, totals. */
function Sheet({ invoice }: { invoice: InvoiceView }) {
  const { t, i18n } = useTranslation();
  const hospital = useSessionStore((state) => state.user?.hospital);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
  const money = (amount: number) => formatMoney(amount, i18n.language);
  return (
    <div className="space-y-5 text-sm">
      <header className="flex items-center justify-between gap-4 border-b-2 border-accent pb-3">
        <div className="flex items-center gap-3">
          {hospital && <HospitalLogo hospital={hospital} className="size-14" />}
          <div>
            <p className="text-lg font-bold text-foreground">{hospital?.name}</p>
            <p className="text-xs text-muted">{t('invoices.sheetTitle')}</p>
          </div>
        </div>
        <div className="text-end text-xs text-muted">
          <p className="text-base font-bold text-foreground">
            {t('invoices.number', { number: invoice.number })}
          </p>
          <p>{date.format(new Date(invoice.issuedAt))}</p>
        </div>
      </header>
      <p>
        <span className="text-muted">{t('invoices.billedTo')} </span>
        <span className="font-semibold text-foreground">
          {patientName({ ...invoice.patient, gender: null, dateOfBirth: null }, t)}
        </span>
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="py-2 text-start font-medium">{t('invoices.service')}</th>
            <th className="py-2 text-center font-medium">{t('invoices.quantity')}</th>
            <th className="py-2 text-end font-medium">{t('invoices.unitPrice')}</th>
            <th className="py-2 text-end font-medium">{t('invoices.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b border-border/60">
              <td className="py-2">{chargeLabel(item, t)}</td>
              <td className="py-2 text-center tabular-nums">{item.quantity}</td>
              <td className="py-2 text-end tabular-nums">{money(item.unitPrice)}</td>
              <td className="py-2 text-end tabular-nums">{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ms-auto w-64 space-y-1">
        <div className="flex justify-between font-bold text-foreground">
          <dt>{t('invoices.total')}</dt>
          <dd className="tabular-nums">{money(invoice.total)}</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>{t('invoices.paid')}</dt>
          <dd className="tabular-nums">{money(invoice.paid)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
          <dt>{t('invoices.due')}</dt>
          <dd className="tabular-nums">{money(Math.max(0, invoice.total - invoice.paid))}</dd>
        </div>
      </dl>
      <footer className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span>
          {invoice.issuedByName && t('invoices.issuedBy', { name: invoice.issuedByName })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-foreground" dir="ltr">
          Powered by <NabdLogo withWordmark className="text-sm" />
        </span>
      </footer>
    </div>
  );
}

// Prints an invoice or saves it as PDF (task 4.13) from the browser's dialog.
export function PrintInvoiceButton({ invoice }: { invoice: InvoiceView }) {
  const { t } = useTranslation();
  const [printing, setPrinting] = useState(false);
  const done = useCallback(() => setPrinting(false), []);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        icon={<Printer className="size-4" />}
        onClick={() => setPrinting(true)}
      >
        {t('invoices.print')}
      </Button>
      {printing && (
        <PrintSheet onDone={done} testId="invoice-sheet">
          <Sheet invoice={invoice} />
        </PrintSheet>
      )}
    </>
  );
}
