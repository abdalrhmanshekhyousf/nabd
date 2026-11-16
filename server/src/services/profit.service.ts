import {
  addLocalDays,
  zonedDate,
  zonedInstant,
  type MonthBreakdown,
  type MonthProfit,
} from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';

/** "2026-11" for an instant, in hospital time. */
export const monthOf = (at: Date) => zonedDate(at).slice(0, 7);

/** The first local day of the month after "2026-11". */
function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** The months ending with `last`, oldest first: ["2026-06", …, "2026-11"]. */
export function lastMonths(count: number, last = monthOf(new Date())) {
  const months = [last];
  while (months.length < count) {
    const [y, m] = months[0]!.split('-').map(Number) as [number, number];
    months.unshift(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`);
  }
  return months;
}

/** A month as [start, end) instants in hospital time. */
export function monthRange(month: string) {
  return { start: zonedInstant(`${month}-01`, 0), end: zonedInstant(`${nextMonth(month)}-01`, 0) };
}

/**
 * The profit of each month (task 4.17): money received (payments) minus the
 * purchases the admin approved that month minus the month's salaries (every
 * active staff member hired by the month's end). A month still running counts
 * its salaries in full.
 */
export async function monthlyProfit(db: ScopedPrisma, months: string[]): Promise<MonthProfit[]> {
  const first = monthRange(months[0]!).start;
  const last = monthRange(months.at(-1)!).end;
  const [payments, purchases, staff] = await Promise.all([
    db.payment.findMany({
      where: { paidAt: { gte: first, lt: last } },
      select: { amount: true, paidAt: true },
    }),
    db.purchaseRequest.findMany({
      where: { status: 'APPROVED', decidedAt: { gte: first, lt: last } },
      select: { totalCost: true, decidedAt: true },
    }),
    db.staffProfile.findMany({
      where: { user: { isActive: true } },
      select: { salary: true, hiredAt: true },
    }),
  ]);
  return months.map((month) => {
    const { end } = monthRange(month);
    const revenue = payments
      .filter((p) => monthOf(p.paidAt) === month)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const bought = purchases
      .filter((p) => p.decidedAt && monthOf(p.decidedAt) === month)
      .reduce((sum, p) => sum + Number(p.totalCost), 0);
    // Hired on a local date: counted from the month they started.
    const lastDay = addLocalDays(zonedDate(end), -1);
    const salaries = staff
      .filter((s) => s.hiredAt.toISOString().slice(0, 10) <= lastDay)
      .reduce((sum, s) => sum + Number(s.salary), 0);
    return {
      month,
      revenue,
      purchases: bought,
      salaries,
      profit: revenue - bought - salaries,
    };
  });
}

/**
 * One month in detail (task 4.18): the services each department gave (at their
 * charged prices), and the month's expenses by type.
 */
export async function monthBreakdown(db: ScopedPrisma, month: string): Promise<MonthBreakdown> {
  const { start, end } = monthRange(month);
  const [byDepartment, [summary]] = await Promise.all([
    db.invoiceItem.groupBy({
      by: ['departmentId'],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { total: true },
    }),
    monthlyProfit(db, [month]),
  ]);
  const departments = await db.department.findMany({
    where: {
      id: { in: byDepartment.flatMap((row) => (row.departmentId ? [row.departmentId] : [])) },
    },
    select: { id: true, name: true, code: true },
  });
  return {
    month,
    revenueByDepartment: byDepartment
      .map((row) => ({
        department: departments.find((d) => d.id === row.departmentId) ?? null,
        amount: Number(row._sum.total ?? 0),
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    expensesByType: [
      { type: 'SALARIES' as const, amount: summary!.salaries },
      { type: 'PURCHASES' as const, amount: summary!.purchases },
    ],
  };
}
