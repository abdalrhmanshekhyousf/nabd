import type { AdminOverview } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
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
const overview: AdminOverview = {
  staff: { total: 42, byRole: [], awayToday: 3 },
  pending: { leave: 2, purchases: 1, repairs: 1 },
  openComplaints: 5,
  beds: [
    { status: 'EMPTY', count: 30 },
    { status: 'OCCUPIED', count: 20 },
  ],
  operatingRooms: [{ status: 'AVAILABLE', count: 3 }],
  upcomingMeetings: 1,
  unreadReports: 2,
  month: { month: '2026-11', revenue: 5000, purchases: 0, salaries: 1000, profit: 4000 },
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
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/profit/overview') return { status: 200, data: overview };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('AdminHome (task 4.20)', () => {
  it('shows the hospital at a glance, each figure linking to its page', async () => {
    renderApp('/admin');
    await screen.findByText('الأسرّة: 30 فاضي من 50');
    const main = within(screen.getByRole('main'));
    const staff = main.getByRole('link', { name: /الموظفين/ });
    expect(staff).toHaveAttribute('href', '/admin/staff');
    expect(staff).toHaveTextContent('42');
    expect(staff).toHaveTextContent('3 غايبين اليوم');
    expect(main.getByRole('link', { name: /طلبات بانتظار قرارك/ })).toHaveTextContent('4');
    expect(main.getByRole('link', { name: /شكاوي بدها رد/ })).toHaveTextContent('5');
    expect(screen.getByText('الأسرّة: 30 فاضي من 50')).toBeInTheDocument();
    expect(main.getByRole('link', { name: /ربح هالشهر/ })).toHaveTextContent('4,000 ل.س');
  });
});
