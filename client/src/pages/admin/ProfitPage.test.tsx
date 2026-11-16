import type { MonthBreakdown, MonthProfit } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const ADMIN: SessionUser = {
  id: 'a1',
  email: 'admin@amal.org',
  fullName: 'المدير',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const months: MonthProfit[] = [
  { month: '2026-10', revenue: 1000, purchases: 300, salaries: 900, profit: -200 },
  { month: '2026-11', revenue: 5000, purchases: 500, salaries: 900, profit: 3600 },
];
const detail = (month: string): MonthBreakdown => ({
  month,
  revenueByDepartment: [
    {
      department: { id: 'd', name: 'المخبر', code: 'LABORATORY' },
      amount: month === '2026-11' ? 4000 : 700,
    },
  ],
  expensesByType: [
    { type: 'SALARIES', amount: 900 },
    { type: 'PURCHASES', amount: 500 },
  ],
});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/profit') return { status: 200, data: { months } };
    if (config.url === '/profit/breakdown')
      return { status: 200, data: detail(config.params?.month as string) };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ProfitPage (task 4.18)', () => {
  it('shows the latest month, the bars, and a month’s detail when chosen', async () => {
    renderApp('/admin/profit');
    const user = userEvent.setup();
    expect((await screen.findAllByText('3,600 ل.س')).length).toBeGreaterThan(0);
    const byDept = await screen.findByRole('region', { name: 'الإيرادات حسب القسم' });
    expect(await within(byDept).findByText('4,000 ل.س')).toBeInTheDocument();
    const chart = screen.getByRole('group', { name: 'الربح شهر بشهر' });
    const bars = within(chart).getAllByRole('button');
    expect(bars).toHaveLength(2);
    await user.click(bars[0]!);
    expect(await within(byDept).findByText('700 ل.س')).toBeInTheDocument();
    expect(screen.getAllByText(/200 ل.س/).length).toBeGreaterThan(0);
    // The exact figures as a table.
    expect(screen.getByRole('table')).toHaveTextContent('5,000 ل.س');
  });
});
