import type { ComplaintView } from '@nabd/shared';
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

const open: ComplaintView = {
  id: 'c1',
  subject: 'تأخير',
  body: 'استنيت ساعتين',
  status: 'OPEN',
  reply: null,
  repliedAt: null,
  repliedByName: null,
  createdAt: new Date().toISOString(),
  author: { id: 'p1', fullName: 'أحمد يوسف' },
  department: null,
};
let openList: ComplaintView[];

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
  openList = [open];
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/complaints/c1/reply') {
      openList = [];
      return { status: 200, data: { complaint: { ...open, status: 'ANSWERED' } } };
    }
    if (config.url === '/complaints')
      return {
        status: 200,
        data: { complaints: config.params?.status === 'OPEN' ? openList : [] },
      };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('AdminComplaintsPage (task 4.9)', () => {
  it('answers an open complaint; an empty answer is refused', async () => {
    renderApp('/admin/complaints');
    const user = userEvent.setup();
    const item = await screen.findByRole('listitem', { name: 'تأخير' });
    expect(item).toHaveTextContent('أحمد يوسف');
    await user.click(within(item).getByRole('button', { name: 'إرسال الرد' }));
    expect(within(item).getByText('هالحقل مطلوب')).toBeInTheDocument();
    await user.type(within(item).getByLabelText('الرد على المريض'), 'آسفين، تابعنا الموضوع');
    await user.click(within(item).getByRole('button', { name: 'إرسال الرد' }));
    expect(await screen.findByText('ما في شكاوي هون.')).toBeInTheDocument();
    const sent = fake.calls.find((c) => c.url === '/complaints/c1/reply')!;
    expect(JSON.parse(sent.data as string)).toEqual({ reply: 'آسفين، تابعنا الموضوع' });
  });
});
