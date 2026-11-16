import type { RevenueReportData } from '@nabd/shared';
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

const ACCOUNTANT: SessionUser = {
  id: 'c1',
  email: 'acc@amal.org',
  fullName: 'رنا',
  role: 'ACCOUNTANT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const figures: RevenueReportData = {
  received: 30000,
  byMethod: [{ method: 'CASH', amount: 30000 }],
  invoices: { issued: 2, issuedTotal: 75000, paid: 1 },
  byService: [{ kind: 'VISIT', amount: 50000, count: 1 }],
  outstanding: 45000,
};

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  fake.calls.length = 0;
  useSessionStore.setState({ status: 'authenticated', user: ACCOUNTANT });
  fake.respond((config) => {
    if (config.url === '/reports/preview') return { status: 200, data: { data: figures } };
    if (config.url === '/reports' && config.method === 'post')
      return { status: 201, data: { report: {} } };
    if (config.url === '/reports') return { status: 200, data: { reports: [] } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('MonthlyReportPage (task 4.16)', () => {
  it('shows the month’s revenue and sends it to the admin', async () => {
    renderApp('/accounting/monthly-report');
    const user = userEvent.setup();
    const preview = await screen.findByRole('region', { name: 'معاينة التقرير' });
    expect(await within(preview).findByText('45,000 ل.س')).toBeInTheDocument();
    expect(preview).toHaveTextContent('فاتورتين انفوترو');
    expect(within(preview).getByRole('region', { name: 'حسب طريقة الدفع' })).toHaveTextContent(
      'كاش',
    );
    await user.type(screen.getByLabelText(/ملاحظات/), 'شهر منيح');
    await user.click(screen.getByRole('button', { name: /إرسال/ }));
    const sent = JSON.parse(fake.calls.find((c) => c.method === 'post')!.data as string);
    expect(sent).toMatchObject({ kind: 'REVENUE', notes: 'شهر منيح' });
  });
});
