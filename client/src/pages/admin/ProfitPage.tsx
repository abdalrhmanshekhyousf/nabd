import type { MonthBreakdown, MonthProfit } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { departmentLabel } from '@/components/departments/departmentDisplay';
import { Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { calm, enter } from '@/lib/motion';
import { playSound } from '@/lib/sound';

/** "Nov 2026" in the user's language. */
function useMonthLabel() {
  const { i18n } = useTranslation();
  const short = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const at = (month: string) => new Date(`${month}-01T12:00:00Z`);
  return { short: (m: string) => short.format(at(m)), long: (m: string) => long.format(at(m)) };
}

function Tile({ label, value, sign }: { label: string; value: string; sign?: 'gain' | 'loss' }) {
  return (
    <Card className="space-y-1 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="flex items-center gap-2 text-2xl font-bold text-foreground tabular-nums">
        {sign === 'gain' && (
          <TrendingUp className="size-5 text-[var(--chart-gain)]" aria-hidden="true" />
        )}
        {sign === 'loss' && (
          <TrendingDown className="size-5 text-[var(--chart-loss)]" aria-hidden="true" />
        )}
        <bdi>{value}</bdi>
      </p>
    </Card>
  );
}

/**
 * Profit per month as bars from a zero line: up in the gain colour, down in
 * the loss colour, so the sign reads from the direction too. Each bar is a
 * button: hover or focus shows the month's figures, a click opens its detail.
 */
function ProfitBars({
  months,
  chosen,
  onChoose,
}: {
  months: MonthProfit[];
  chosen: string;
  onChoose: (month: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const label = useMonthLabel();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const [hover, setHover] = useState<string | null>(null);
  const top = Math.max(0, ...months.map((m) => m.profit));
  const bottom = Math.min(0, ...months.map((m) => m.profit));
  const span = top - bottom || 1;
  const zero = (top / span) * 100;
  const shown = months.find((m) => m.month === (hover ?? chosen));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--chart-gain)]" aria-hidden="true" />
          {t('profit.gain')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--chart-loss)]" aria-hidden="true" />
          {t('profit.loss')}
        </span>
      </div>
      <div className="relative h-56" role="group" aria-label={t('profit.chart')}>
        {/* The zero line. */}
        <div
          className="absolute inset-x-0 border-t border-border"
          style={{ top: `${zero}%` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-stretch gap-[2px]" dir="ltr">
          {months.map((m) => {
            const height = (Math.abs(m.profit) / span) * 100;
            const up = m.profit >= 0;
            const active = m.month === chosen;
            return (
              <button
                key={m.month}
                type="button"
                aria-label={`${label.long(m.month)}: ${money(m.profit)}`}
                aria-pressed={active}
                onMouseEnter={() => setHover(m.month)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.month)}
                onBlur={() => setHover(null)}
                onClick={() => {
                  playSound('tap');
                  onChoose(m.month);
                }}
                className={cn(
                  'group relative flex-1 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                  active ? 'bg-surface-muted' : 'hover:bg-surface-muted/60',
                )}
              >
                <motion.span
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={calm}
                  className={cn(
                    'absolute inset-x-[18%]',
                    up
                      ? 'origin-bottom rounded-t bg-[var(--chart-gain)]'
                      : 'origin-top rounded-b bg-[var(--chart-loss)]',
                  )}
                  style={
                    up
                      ? { bottom: `${100 - zero}%`, height: `${height}%` }
                      : { top: `${zero}%`, height: `${height}%` }
                  }
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-[2px] text-center text-[0.65rem] text-muted" dir="ltr">
        {months.map((m) => (
          <span key={m.month} className="flex-1 truncate">
            {label.short(m.month)}
          </span>
        ))}
      </div>
      {shown && (
        <dl
          aria-live="polite"
          className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-surface-muted/60 px-3 py-2 text-xs sm:grid-cols-5"
        >
          <dt className="col-span-2 font-semibold text-foreground sm:col-span-1">
            {label.long(shown.month)}
          </dt>
          {(['revenue', 'purchases', 'salaries', 'profit'] as const).map((key) => (
            <div key={key} className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">{t(`profit.${key}`)}</dt>
              <dd className="font-medium text-foreground tabular-nums">
                <bdi>{money(shown[key])}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Horizontal bars of one measure, longest first, the value written at the end. */
function Bars({ rows, empty }: { rows: { label: string; amount: number }[]; empty: string }) {
  const { i18n } = useTranslation();
  const max = Math.max(1, ...rows.map((row) => row.amount));
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${formatMoney(row.amount, i18n.language)}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{row.label}</span>
            <bdi className="shrink-0 text-muted tabular-nums">
              {formatMoney(row.amount, i18n.language)}
            </bdi>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(row.amount / max) * 100}%` }}
              transition={calm}
              className="h-full rounded-full bg-[var(--chart-gain)]"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// The admin's profit (task 4.18): the year month by month (money received −
// approved purchases − salaries, 4.17), and one month in detail: revenue by
// the department that gave each service, expenses by type. A table of every
// month is there for reading the exact figures.
export function ProfitPage() {
  const { t, i18n } = useTranslation();
  const label = useMonthLabel();
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const [chosen, setChosen] = useState<string | null>(null);
  const { data: months } = useQuery({
    queryKey: queryKeys.profit,
    queryFn: async () =>
      (await api.get<{ months: MonthProfit[] }>('/profit', { params: { months: 12 } })).data.months,
  });
  const month = chosen ?? months?.at(-1)?.month ?? null;
  const { data: detail } = useQuery({
    enabled: Boolean(month),
    queryKey: queryKeys.profitBreakdown(month ?? ''),
    queryFn: async () =>
      (await api.get<MonthBreakdown>('/profit/breakdown', { params: { month } })).data,
  });
  const current = months?.find((m) => m.month === month);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('profit.title')}</h2>
        <p className="text-sm text-muted">{t('profit.description')}</p>
      </motion.div>

      {!months || !current ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <motion.div {...enter(1)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              label={t('profit.revenueOf', { month: label.long(current.month) })}
              value={money(current.revenue)}
            />
            <Tile
              label={t('profit.expensesOf', { month: label.long(current.month) })}
              value={money(current.purchases + current.salaries)}
            />
            <Tile
              label={t('profit.profitOf', { month: label.long(current.month) })}
              value={money(current.profit)}
              sign={current.profit >= 0 ? 'gain' : 'loss'}
            />
          </motion.div>

          <motion.div {...enter(2)}>
            <Card className="space-y-3 p-4 sm:p-5">
              <h3 className="font-semibold text-foreground">{t('profit.byMonth')}</h3>
              <ProfitBars months={months} chosen={current.month} onChoose={setChosen} />
              <details className="text-sm">
                <summary className="cursor-pointer text-accent">{t('profit.asTable')}</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted">
                        <th className="py-1.5 text-start font-medium">{t('profit.month')}</th>
                        {(['revenue', 'purchases', 'salaries', 'profit'] as const).map((key) => (
                          <th key={key} className="py-1.5 text-end font-medium">
                            {t(`profit.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.month} className="border-b border-border/60">
                          <td className="py-1.5">{label.long(m.month)}</td>
                          {(['revenue', 'purchases', 'salaries', 'profit'] as const).map((key) => (
                            <td key={key} className="py-1.5 text-end tabular-nums">
                              <bdi>{money(m[key])}</bdi>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Card>
          </motion.div>

          <motion.div {...enter(3)} className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-3 p-4 sm:p-5">
              <section aria-label={t('profit.byDepartment')} className="space-y-3">
                <h3 className="font-semibold text-foreground">
                  {t('profit.byDepartment')}{' '}
                  <span className="text-xs font-normal text-muted">
                    · {label.long(current.month)}
                  </span>
                </h3>
                {detail ? (
                  <Bars
                    empty={t('profit.noRevenue')}
                    rows={detail.revenueByDepartment.map((row) => ({
                      label: row.department
                        ? departmentLabel(row.department, t)
                        : t('profit.otherDepartment'),
                      amount: row.amount,
                    }))}
                  />
                ) : (
                  <Spinner />
                )}
              </section>
            </Card>
            <Card className="space-y-3 p-4 sm:p-5">
              <section aria-label={t('profit.byType')} className="space-y-3">
                <h3 className="font-semibold text-foreground">
                  {t('profit.byType')}{' '}
                  <span className="text-xs font-normal text-muted">
                    · {label.long(current.month)}
                  </span>
                </h3>
                {detail ? (
                  <Bars
                    empty={t('profit.noRevenue')}
                    rows={detail.expensesByType.map((row) => ({
                      label: t(`profit.types.${row.type}`),
                      amount: row.amount,
                    }))}
                  />
                ) : (
                  <Spinner />
                )}
              </section>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
