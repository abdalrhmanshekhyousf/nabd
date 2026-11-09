import type { PharmacyReportData } from '@nabd/shared';
import { motion } from 'framer-motion';
import { AlertTriangle, PackageMinus, PackagePlus, PackageX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { calm } from '@/lib/motion';

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  empty,
  bare = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  empty: boolean;
  /** Its own layout instead of the bordered list. */
  bare?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={title} className="break-inside-avoid space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h4>
      {empty ? (
        <p className="text-sm text-muted">{t('reports.nothing')}</p>
      ) : bare ? (
        children
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {children}
        </ul>
      )}
    </section>
  );
}

function Row({ name, value, tone }: { name: string; value: string; tone?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="min-w-0 break-words text-foreground">{name}</span>
      <span className={cn('shrink-0 text-xs text-muted tabular-nums', tone)}>{value}</span>
    </li>
  );
}

// What a pharmacy report says (task 3.11): the prescriptions, what went out,
// what was asked for but missing, what came in, and what is running low.
export function ReportBody({
  data,
  notes,
  still = false,
  unavailableEditor,
}: {
  data: PharmacyReportData;
  notes?: string | null;
  /** No fade in (printing). */
  still?: boolean;
  /** Replaces the missing medicines while the pharmacist edits them. */
  unavailableEditor?: ReactNode;
}) {
  const { t } = useTranslation();
  const amount = (quantity: number, unit: string) => t('reports.quantity', { quantity, unit });
  return (
    <motion.div
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={calm}
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure
          label={t('reports.figures.dispensed')}
          value={data.prescriptions.dispensed}
          tone="text-success"
        />
        <Figure
          label={t('reports.figures.withMissing')}
          value={data.prescriptions.withMissing}
          tone="text-warning"
        />
        <Figure
          label={t('reports.figures.waiting')}
          value={data.prescriptions.waiting}
          tone="text-info"
        />
        <Figure
          label={t('reports.figures.outOfStock')}
          value={data.outOfStock}
          tone={data.outOfStock ? 'text-danger' : 'text-foreground'}
        />
      </div>
      {notes && (
        <div className="rounded-lg bg-accent/8 px-3 py-2 text-sm">
          <p className="mb-0.5 text-xs font-semibold text-accent">{t('reports.notesTitle')}</p>
          <p className="whitespace-pre-line text-foreground">{notes}</p>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t('reports.sections.dispensed')}
          icon={<PackageMinus className="size-4 text-accent" aria-hidden="true" />}
          empty={data.dispensed.length === 0}
        >
          {data.dispensed.map((row) => (
            <Row key={row.name} name={row.name} value={amount(row.quantity, row.unit)} />
          ))}
        </Section>
        <Section
          title={t('reports.sections.unavailable')}
          icon={<PackageX className="size-4 text-warning" aria-hidden="true" />}
          empty={!unavailableEditor && data.unavailable.length === 0}
          bare={Boolean(unavailableEditor)}
        >
          {unavailableEditor ??
            data.unavailable.map((row) => (
              <Row
                key={row.drugName}
                name={row.drugName}
                value={t('reports.times', { count: row.times })}
                tone="text-warning"
              />
            ))}
        </Section>
        <Section
          title={t('reports.sections.received')}
          icon={<PackagePlus className="size-4 text-success" aria-hidden="true" />}
          empty={data.received.length === 0}
        >
          {data.received.map((row) => (
            <Row key={row.name} name={row.name} value={amount(row.quantity, row.unit)} />
          ))}
        </Section>
        <Section
          title={t('reports.sections.low')}
          icon={<AlertTriangle className="size-4 text-danger" aria-hidden="true" />}
          empty={data.low.length === 0}
        >
          {data.low.map((row) => (
            <Row
              key={row.name}
              name={row.name}
              value={t('reports.lowLine', {
                quantity: row.quantity,
                unit: row.unit,
                min: row.minQuantity,
              })}
              tone={row.quantity === 0 ? 'text-danger' : 'text-warning'}
            />
          ))}
        </Section>
      </div>
    </motion.div>
  );
}
