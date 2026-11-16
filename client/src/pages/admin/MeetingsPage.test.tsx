import type { MeetingView } from '@nabd/shared';
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

const user = (role: 'ADMIN' | 'DOCTOR'): SessionUser => ({
  id: role === 'ADMIN' ? 'a1' : '01a1e0b8-0000-7000-8000-0000000000d1',
  email: 'x@amal.org',
  fullName: role === 'ADMIN' ? 'المدير' : 'د. سامي',
  role,
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
});

const meeting: MeetingView = {
  id: 'm1',
  startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  topic: 'جدول المناوبات',
  status: 'REQUESTED',
  response: null,
  createdAt: new Date().toISOString(),
  doctor: { id: '01a1e0b8-0000-7000-8000-0000000000d1', fullName: 'د. سامي' },
  calledBy: { id: 'a1', fullName: 'المدير' },
};
let meetings: MeetingView[];

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
  meetings = [];
  fake.respond((config) => {
    if (config.url === '/staff')
      return {
        status: 200,
        data: { staff: [{ id: '01a1e0b8-0000-7000-8000-0000000000d1', fullName: 'د. سامي' }] },
      };
    if (config.url === '/meetings' && config.method === 'post') {
      meetings = [meeting];
      return { status: 201, data: { meeting } };
    }
    if (config.url === '/meetings') return { status: 200, data: { upcoming: meetings, past: [] } };
    if (config.url === '/meetings/mine') return { status: 200, data: { meetings } };
    if (config.url === '/meetings/m1/answer') {
      meetings = [{ ...meeting, status: 'ACCEPTED' }];
      return { status: 200, data: { meeting: meetings[0] } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('meetings (task 4.10)', () => {
  it('the admin asks a doctor to meet', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('ADMIN') });
    renderApp('/admin/meetings');
    const u = userEvent.setup();
    const form = await screen.findByRole('form', { name: 'طلب اجتماع' });
    await u.click(within(form).getByRole('button', { name: 'إرسال الطلب' }));
    expect(within(form).getAllByText('هالحقل مطلوب').length).toBeGreaterThan(0);
    await u.selectOptions(
      await within(form).findByLabelText('الطبيب'),
      '01a1e0b8-0000-7000-8000-0000000000d1',
    );
    await u.type(within(form).getByLabelText('الموضوع'), 'جدول المناوبات');
    await u.click(within(form).getByRole('button', { name: 'إرسال الطلب' }));
    const coming = await screen.findByRole('region', { name: 'الاجتماعات الجاية' });
    expect(await within(coming).findByText('بانتظار الرد')).toBeInTheDocument();
    const body = JSON.parse(fake.calls.find((c) => c.method === 'post')!.data as string);
    expect(body).toMatchObject({
      doctorId: '01a1e0b8-0000-7000-8000-0000000000d1',
      topic: 'جدول المناوبات',
    });
    expect(Date.parse(body.startsAt)).toBeGreaterThan(Date.now());
  });

  it('the doctor accepts with a word', async () => {
    meetings = [meeting];
    useSessionStore.setState({ status: 'authenticated', user: user('DOCTOR') });
    renderApp('/doctor/meetings');
    const u = userEvent.setup();
    const item = await screen.findByRole('listitem', { name: 'جدول المناوبات' });
    await u.type(within(item).getByLabelText(/كلمة للمدير/), 'تمام');
    await u.click(within(item).getByRole('button', { name: 'موافق' }));
    expect(await within(item).findByText('موافق', { selector: 'span' })).toBeInTheDocument();
    const sent = fake.calls.find((c) => c.url === '/meetings/m1/answer')!;
    expect(JSON.parse(sent.data as string)).toEqual({ answer: 'ACCEPTED', response: 'تمام' });
  });
});
