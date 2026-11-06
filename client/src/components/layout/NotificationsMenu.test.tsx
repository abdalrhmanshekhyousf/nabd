import type { NotificationItem } from '@nabd/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/relativeTime';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const NURSE: SessionUser = {
  id: 'u1',
  email: 'lina@amal.org',
  fullName: 'لينا',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: crypto.randomUUID(),
    type: 'CLEANING_REQUEST',
    data: {},
    urgent: false,
    link: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let inbox: NotificationItem[];

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
  inbox = [
    item({ id: 'call', type: 'DOCTOR_CALL', urgent: true, link: '/nurse/emergency' }),
    item({
      id: 'stock',
      type: 'LOW_STOCK',
      data: { item: 'سيفترياكسون 1 غ فيال', quantity: 12, unit: 'فيال', min: 40 },
      link: '/pharmacy/inventory',
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    }),
    item({
      id: 'old',
      type: 'COMPLAINT',
      readAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    }),
  ];
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    const unread = () => inbox.filter((n) => !n.readAt).length;
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: inbox, unread: unread() } };
    }
    const read = config.url?.match(/^\/notifications\/(.+)\/read$/)?.[1];
    if (read) {
      inbox = inbox.map((n) => (n.id === read ? { ...n, readAt: new Date().toISOString() } : n));
      return { status: 200, data: { unread: unread() } };
    }
    if (config.url === '/notifications/read-all') {
      inbox = inbox.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }));
      return { status: 200, data: { unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

const bell = () => screen.findByRole('button', { name: /^الإشعارات/ });

async function openMenu() {
  const user = userEvent.setup();
  const router = renderApp('/nurse');
  await waitFor(async () =>
    expect(await bell()).toHaveAccessibleName('الإشعارات: إشعارين غير مقروءين'),
  );
  await user.click(await bell());
  const panel = await screen.findByRole('dialog', { name: /^الإشعارات/ });
  return { user, router, panel };
}

describe('NotificationsMenu', () => {
  it('shows how many are unread on the bell', async () => {
    renderApp('/nurse');

    await waitFor(async () =>
      expect(await bell()).toHaveAccessibleName('الإشعارات: إشعارين غير مقروءين'),
    );
  });

  it('lists the latest with their time, marking urgent and unread ones', async () => {
    const { panel } = await openMenu();

    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('استدعاء عاجل للإسعاف'),
      expect.stringContaining(
        'صنف قرب يخلص من المخزونسيفترياكسون 1 غ فيال: بقي 12 فيال، والحد الأدنى 40',
      ),
      expect.stringContaining('شكوى جديدة'),
    ]);
    expect(within(rows[0]).getByLabelText('عاجل')).toBeInTheDocument();
    expect(within(rows[1]).getByText(relativeTime(inbox[1].createdAt, 'ar'))).toBeInTheDocument();
    expect(within(panel).getAllByLabelText('غير مقروء')).toHaveLength(2);
  });

  it('opening one marks it read and follows its link', async () => {
    const { user, router, panel } = await openMenu();

    await user.click(within(panel).getByRole('button', { name: /استدعاء عاجل للإسعاف/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/nurse/emergency'));
    expect(
      fake.calls.some((c) => c.method === 'patch' && c.url === '/notifications/call/read'),
    ).toBe(true);
    await waitFor(async () =>
      expect(await bell()).toHaveAccessibleName('الإشعارات: إشعار واحد غير مقروء'),
    );
  });

  it('marks everything read at once', async () => {
    const { user, panel } = await openMenu();

    await user.click(within(panel).getByRole('button', { name: 'تعليم الكل كمقروء' }));

    await waitFor(async () => expect(await bell()).toHaveAccessibleName('الإشعارات'));
    expect(within(panel).queryAllByLabelText('غير مقروء')).toHaveLength(0);
    expect(fake.calls.some((c) => c.url === '/notifications/read-all')).toBe(true);
  });

  it('counts a notification that arrives live', async () => {
    renderApp('/nurse');
    await waitFor(async () =>
      expect(await bell()).toHaveAccessibleName('الإشعارات: إشعارين غير مقروءين'),
    );
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    act(() => lastSocket().fromServer('notification', item({ type: 'LAB_RESULT' })));

    await waitFor(async () =>
      expect(await bell()).toHaveAccessibleName('الإشعارات: 3 إشعارات غير مقروءة'),
    );
  });

  it('says so when there are none yet', async () => {
    inbox = [];
    const user = userEvent.setup();
    renderApp('/nurse');

    await user.click(await bell());

    expect(await screen.findByText('ما في إشعارات لسا')).toBeInTheDocument();
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('reads naturally in both languages', () => {
    expect(relativeTime(ago(10), 'en', now)).toBe('now');
    expect(relativeTime(ago(5 * 60), 'en', now)).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * 3600), 'en', now)).toBe('3 hours ago');
    expect(relativeTime(ago(26 * 3600), 'en', now)).toBe('yesterday');
    expect(relativeTime(ago(10 * 86400), 'en', now)).toBe('Oct 23, 2026');
    expect(relativeTime(ago(5 * 60), 'ar', now)).toMatch(/^قبل (5|٥) دقائق$/);
  });
});
