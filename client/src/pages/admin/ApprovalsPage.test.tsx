import type { LeaveView, PurchaseView } from '@nabd/shared';
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
const WARD = { id: 'w', name: 'الداخلية', code: 'INTERNAL_MEDICINE' as const };

let leave: LeaveView[];
let purchases: PurchaseView[];

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
  leave = [
    {
      id: 'l1',
      from: '2026-12-01',
      to: '2026-12-03',
      days: 3,
      reason: 'سفر',
      status: 'PENDING',
      decisionNote: null,
      decidedAt: null,
      decidedByName: null,
      createdAt: new Date().toISOString(),
      requester: { id: 'n1', fullName: 'ريم', role: 'NURSE', department: WARD },
    },
  ];
  purchases = [
    {
      id: 'p1',
      department: WARD,
      requestedByName: 'د. سامي',
      note: null,
      totalCost: 5000,
      status: 'PENDING',
      decisionNote: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
      items: [
        { id: 'i', inventoryItemId: null, name: 'شاش', unit: null, quantity: 5, unitCost: 1000 },
      ],
    },
  ];
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/approvals/leave/l1') {
      leave = [];
      return { status: 200, data: { request: {} } };
    }
    if (config.url === '/approvals/purchase/p1') {
      purchases = [];
      return { status: 200, data: { request: {} } };
    }
    if (config.url === '/approvals')
      return {
        status: 200,
        data:
          config.params?.status === 'PENDING'
            ? { leave, purchases, repairs: [] }
            : { leave: [], purchases: [], repairs: [] },
      };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ApprovalsPage (task 4.7)', () => {
  it('approves a leave, and rejects a purchase only with a reason', async () => {
    renderApp('/admin/approvals');
    const user = userEvent.setup();
    const leaveColumn = await screen.findByRole('region', { name: 'الإجازات' });
    const row = within(leaveColumn).getByRole('listitem', { name: 'ريم' });
    expect(row).toHaveTextContent('3 أيام');
    await user.click(within(row).getByRole('button', { name: 'موافقة' }));
    expect(await within(leaveColumn).findByText('ما في طلبات هون.')).toBeInTheDocument();
    const approved = fake.calls.find((c) => c.url === '/approvals/leave/l1')!;
    expect(JSON.parse(approved.data as string)).toEqual({ decision: 'APPROVED', note: null });

    const buying = screen.getByRole('region', { name: 'الشراء' });
    expect(buying).toHaveTextContent('شاش × 5');
    await user.click(within(buying).getByRole('button', { name: 'رفض' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'رفض' }));
    expect(within(dialog).getByText('هالحقل مطلوب')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/ليش/), 'الميزانية خلصت');
    await user.click(within(dialog).getByRole('button', { name: 'رفض' }));
    expect(await within(buying).findByText('ما في طلبات هون.')).toBeInTheDocument();
    const rejected = fake.calls.find((c) => c.url === '/approvals/purchase/p1')!;
    expect(JSON.parse(rejected.data as string)).toEqual({
      decision: 'REJECTED',
      note: 'الميزانية خلصت',
    });
  });
});
