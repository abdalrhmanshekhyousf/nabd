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

const PATIENT: SessionUser = {
  id: 'p1',
  email: 'p@mail.com',
  fullName: 'أحمد',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

let complaints: ComplaintView[];

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
  complaints = [
    {
      id: 'c0',
      subject: 'النظافة',
      body: 'الحمام مو نضيف',
      status: 'ANSWERED',
      reply: 'تابعنا الموضوع مع قسم التنظيف',
      repliedAt: new Date().toISOString(),
      repliedByName: 'المدير',
      createdAt: new Date().toISOString(),
      author: { id: 'p1', fullName: 'أحمد' },
      department: null,
    },
  ];
  useSessionStore.setState({ status: 'authenticated', user: PATIENT });
  fake.respond((config) => {
    if (config.url === '/complaints' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      complaints = [
        { ...complaints[0]!, id: 'c1', ...body, status: 'OPEN', reply: null },
        ...complaints,
      ];
      return { status: 201, data: { complaint: complaints[0] } };
    }
    if (config.url === '/complaints/mine') return { status: 200, data: { complaints } };
    if (config.url === '/departments') return { status: 200, data: { departments: [] } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ComplaintsPage (task 4.8)', () => {
  it('sends a complaint and shows the administration’s answers', async () => {
    renderApp('/patient/complaints');
    const user = userEvent.setup();
    expect(await screen.findByText('تابعنا الموضوع مع قسم التنظيف')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'شكوى جديدة' });
    await user.click(within(form).getByRole('button', { name: 'إرسال للإدارة' }));
    expect(within(form).getAllByText('هالحقل مطلوب')).toHaveLength(2);
    await user.type(within(form).getByLabelText('عن شو الشكوى'), 'تأخير');
    await user.type(within(form).getByLabelText('شو صار'), 'استنيت ساعتين');
    await user.click(within(form).getByRole('button', { name: 'إرسال للإدارة' }));
    const mine = await screen.findByRole('region', { name: 'شكاويي' });
    expect(await within(mine).findByText('عم تنقرأ')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(post.data as string)).toEqual({
      departmentId: null,
      subject: 'تأخير',
      body: 'استنيت ساعتين',
    });
  });
});
