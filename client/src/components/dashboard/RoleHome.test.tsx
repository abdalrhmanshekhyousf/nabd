import type { HomeTile } from '@nabd/shared';
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

const LAB: SessionUser = {
  id: 'l1',
  email: 'lab@amal.org',
  fullName: 'هبة',
  role: 'LAB_TECHNICIAN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const tiles: HomeTile[] = [
  { key: 'testsWaiting', value: 7, to: '/lab/requests', alert: true },
  { key: 'doneToday', value: 12, to: '/lab/requests' },
  { key: 'lowStock', value: 0, to: '/lab/inventory' },
];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  queryClient.clear();
  useSessionStore.setState({ status: 'authenticated', user: LAB });
  fake.respond((config) => {
    if (config.url === '/me/home') return { status: 200, data: { tiles } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('RoleHome', () => {
  it("shows today's figures of the role, each leading to its page", async () => {
    renderApp('/lab');
    const today = await screen.findByRole('region', { name: 'شغل اليوم' });
    const waiting = within(today).getByRole('link', { name: /تحاليل ناطرة/ });
    expect(waiting).toHaveTextContent('7');
    expect(waiting).toHaveAttribute('href', '/lab/requests');
    expect(within(today).getByRole('link', { name: /أصناف ناقصة/ })).toHaveAttribute(
      'href',
      '/lab/inventory',
    );
  });
});
