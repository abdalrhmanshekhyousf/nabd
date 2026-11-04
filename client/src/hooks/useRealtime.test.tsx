import type { NotificationItem } from '@nabd/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/app/queryClient';
import { queryKeys } from '@/app/queryKeys';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { setAccessToken } from '@/lib/accessToken';
import { api } from '@/lib/api';
import type * as sound from '@/lib/sound';
import { playSound } from '@/lib/sound';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';
import type { NotificationsData } from './useRealtime';

vi.mock('@/lib/sound', async (original) => ({
  ...(await original<typeof sound>()),
  playSound: vi.fn(),
}));

const fake = fakeApi(api);

const ADMIN: SessionUser = {
  id: 'u1',
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: crypto.randomUUID(),
    type: 'CLEANING_REQUEST',
    data: { place: 'غرفة 101' },
    urgent: false,
    link: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let refreshOk = true;

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
  refreshOk = true;
  vi.mocked(playSound).mockClear();
  setAccessToken('first-token');
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  fake.respond((config) => {
    if (config.url === '/auth/refresh') {
      return refreshOk
        ? { status: 200, data: { accessToken: 'fresh-token', expiresIn: 900, user: ADMIN } }
        : { status: 401, data: { error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' } } };
    }
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

async function signedIn() {
  const router = renderApp('/admin');
  await waitFor(() => expect(fakeSockets).toHaveLength(1));
  return { router, socket: lastSocket() };
}

describe('useRealtime', () => {
  it('connects to the API server with the access token', async () => {
    const { socket } = await signedIn();

    expect(socket.connected).toBe(true);
    expect(socket.url).toBe('http://localhost:4000');
    expect(socket.token()).toBe('first-token');
  });

  it('shows a notification in the reader’s language with its details', async () => {
    const { socket } = await signedIn();

    act(() => socket.fromServer('notification', item()));

    expect(await screen.findByText('طلب تنظيف جديد')).toBeInTheDocument();
    expect(screen.getByText('المكان: غرفة 101')).toBeInTheDocument();
    expect(playSound).toHaveBeenCalledWith('notify');
  });

  it('rings for urgent notifications and opens their link', async () => {
    const { socket, router } = await signedIn();
    const user = userEvent.setup();

    act(() =>
      socket.fromServer(
        'notification',
        item({
          type: 'DOCTOR_CALL',
          urgent: true,
          data: { patient: 'مريض مجهول', complaint: 'ألم بالصدر', level: 2 },
          link: '/admin/staff',
        }),
      ),
    );

    expect(await screen.findByText('استدعاء عاجل للإسعاف')).toBeInTheDocument();
    expect(screen.getByText('مريض مجهول · ألم بالصدر · مستوى الخطورة 2')).toBeInTheDocument();
    expect(playSound).toHaveBeenCalledWith('urgent');
    await user.click(screen.getByRole('button', { name: 'فتح' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/staff'));
  });

  it('adds the notification to the cached list and counts it unread', async () => {
    queryClient.setQueryData<NotificationsData>(queryKeys.notifications, {
      notifications: [],
      unread: 0,
    });
    const { socket } = await signedIn();
    const first = item();

    act(() => socket.fromServer('notification', first));
    act(() => socket.fromServer('notification', first));

    expect(queryClient.getQueryData<NotificationsData>(queryKeys.notifications)).toEqual({
      notifications: [first],
      unread: 1,
    });
  });

  it('refresh events make the named data stale', async () => {
    queryClient.setQueryData(['operating-rooms'], []);
    queryClient.setQueryData(['departments'], []);
    const { socket } = await signedIn();

    act(() => socket.fromServer('refresh', { queryKeys: [['operating-rooms']] }));

    await waitFor(() =>
      expect(queryClient.getQueryState(['operating-rooms'])?.isInvalidated).toBe(true),
    );
    expect(queryClient.getQueryState(['departments'])?.isInvalidated).toBe(false);
  });

  it('renews the token and reconnects when the server hangs up', async () => {
    const { socket } = await signedIn();

    act(() => socket.fromServer('disconnect', 'io server disconnect'));

    await waitFor(() => expect(socket.connectCalls).toBe(2));
    expect(socket.token()).toBe('fresh-token');
  });

  it('gives up when the session can no longer be renewed', async () => {
    const { socket } = await signedIn();
    refreshOk = false;

    act(() => socket.fromServer('connect_error', new Error('UNAUTHENTICATED')));

    await waitFor(() => expect(fake.calls.some((c) => c.url === '/auth/refresh')).toBe(true));
    expect(socket.connectCalls).toBe(1);
  });

  it('closes the connection when the user signs out', async () => {
    const { socket } = await signedIn();

    act(() => useSessionStore.setState({ status: 'anonymous', user: null }));

    await waitFor(() => expect(socket.connected).toBe(false));
  });
});
