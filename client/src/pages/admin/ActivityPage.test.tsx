import type { AuditEntry } from '@nabd/shared';
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
const entry = (id: string, action: AuditEntry['action'], userName: string): AuditEntry => ({
  id,
  userName,
  role: 'DOCTOR',
  action,
  patientId: 'p1',
  patientName: 'سارة',
  path: '/api/x',
  ip: '127.0.0.1',
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
  fake.calls.length = 0;
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/audit') {
      const all = [entry('e1', 'EDIT', 'د. ريم'), entry('e2', 'VIEW', 'د. سامي')];
      const entries = config.params?.action
        ? all.filter((e) => e.action === config.params.action)
        : all;
      return { status: 200, data: { entries, total: entries.length, pageSize: 50 } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ActivityPage (task 4.22)', () => {
  it('lists who opened or changed which file, and filters by kind', async () => {
    renderApp('/admin/activity');
    const user = userEvent.setup();
    expect(await screen.findByText('عدّل بملف سارة')).toBeInTheDocument();
    expect(screen.getByText('فتح ملف سارة')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('النوع'), 'EDIT');
    expect(await screen.findByText('نشاط واحد')).toBeInTheDocument();
    expect(screen.queryByText('فتح ملف سارة')).toBeNull();
    expect(fake.calls.at(-1)!.params).toMatchObject({ action: 'EDIT', page: 0 });
  });
});
