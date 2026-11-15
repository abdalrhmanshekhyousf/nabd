import { addLocalDays, zonedDate, type LeaveView } from '@nabd/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const NURSE: SessionUser = {
  id: 'n1',
  email: 'nurse@amal.org',
  fullName: 'ريم',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const today = zonedDate(new Date());
let requests: LeaveView[];

const view = (more: Partial<LeaveView>): LeaveView => ({
  id: 'l1',
  from: addLocalDays(today, 2),
  to: addLocalDays(today, 4),
  days: 3,
  reason: 'سفر',
  status: 'PENDING',
  decisionNote: null,
  decidedAt: null,
  decidedByName: null,
  createdAt: new Date().toISOString(),
  requester: { id: 'n1', fullName: 'ريم', role: 'NURSE', department: null },
  ...more,
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
  fake.calls.length = 0;
  requests = [view({ id: 'old', status: 'REJECTED', decisionNote: 'ضغط شغل' })];
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/leave' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      if (body.reason === 'تكرار')
        return apiError(409, 'LEAVE_OVERLAP', 'عندك طلب إجازة بنفس هالأيام');
      requests = [view({ id: 'l2', ...body, reason: body.reason }), ...requests];
      return { status: 201, data: { request: requests[0] } };
    }
    if (config.url === '/leave/l2' && config.method === 'delete') {
      requests = requests.map((r) => (r.id === 'l2' ? { ...r, status: 'CANCELLED' } : r));
      return { status: 200, data: { request: requests[0] } };
    }
    if (config.url === '/leave/mine') return { status: 200, data: { requests } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('LeavePage (task 4.5)', () => {
  it('asks for leave, shows the decision on older ones, and withdraws a pending one', async () => {
    renderApp('/nurse/leave');
    const user = userEvent.setup();
    expect(await screen.findByText('رد الإدارة: ضغط شغل')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'طلب إجازة جديد' });
    await user.click(within(form).getByRole('button', { name: 'إرسال للمدير' }));
    expect(within(form).getByText('هالحقل مطلوب')).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('من يوم'), {
      target: { value: addLocalDays(today, 2) },
    });
    fireEvent.change(within(form).getByLabelText('لحد يوم'), {
      target: { value: addLocalDays(today, 4) },
    });
    await user.type(within(form).getByLabelText('السبب'), 'سفر');
    await user.click(within(form).getByRole('button', { name: 'إرسال للمدير' }));
    const mine = await screen.findByRole('region', { name: 'طلباتي' });
    expect(await within(mine).findByText('بانتظار القرار')).toBeInTheDocument();
    expect(within(mine).getAllByText('3 أيام')).toHaveLength(2);

    await user.click(within(mine).getByRole('button', { name: 'سحب الطلب' }));
    expect(await within(mine).findAllByText('مسحوب')).toHaveLength(1);
  });

  it('says when the days were already asked for', async () => {
    renderApp('/nurse/leave');
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'طلب إجازة جديد' });
    await user.type(within(form).getByLabelText('السبب'), 'تكرار');
    await user.click(within(form).getByRole('button', { name: 'إرسال للمدير' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('عندك طلب إجازة بنفس هالأيام');
  });
});
