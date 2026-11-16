import type { ReportView } from '@nabd/shared';
import { screen } from '@testing-library/react';
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
const report = (id: string, kind: ReportView['kind'], authorName: string): ReportView => ({
  id,
  kind,
  periodFrom: '2026-10-01T00:00:00.000Z',
  periodTo: '2026-11-01T00:00:00.000Z',
  data:
    kind === 'REVENUE'
      ? {
          received: 0,
          byMethod: [],
          invoices: { issued: 0, issuedTotal: 0, paid: 0 },
          byService: [],
          outstanding: 0,
        }
      : {
          prescriptions: { dispensed: 0, withMissing: 0, waiting: 0 },
          dispensed: [],
          unavailable: [],
          received: [],
          low: [],
          outOfStock: 0,
        },
  notes: null,
  authorName,
  readAt: null,
  createdAt: new Date().toISOString(),
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
    if (config.url === '/reports')
      return {
        status: 200,
        data: { reports: [report('r1', 'PHARMACY', 'لينا'), report('r2', 'REVENUE', 'رنا')] },
      };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ReportsPage (task 4.19)', () => {
  it('shows the pharmacy’s and the accountant’s reports, and filters by kind', async () => {
    renderApp('/admin/reports');
    const user = userEvent.setup();
    expect(await screen.findByText(/لينا/)).toBeInTheDocument();
    expect(screen.getByText(/رنا/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'الإيرادات' }));
    expect(screen.queryByText(/لينا/)).toBeNull();
    expect(screen.getByText(/رنا/)).toBeInTheDocument();
  });
});
