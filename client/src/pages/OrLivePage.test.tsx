import type { BookingView, OrBoardRoom } from '@nabd/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const user = (role: 'ADMIN' | 'DOCTOR'): SessionUser => ({
  id: 'u1',
  email: 'x@amal.org',
  fullName: role === 'ADMIN' ? 'المدير' : 'د. نور',
  role,
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
});

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const operation: BookingView = {
  id: 'b1',
  kind: 'EMERGENCY',
  status: 'IN_PROGRESS',
  operatingRoom: { id: 'r1', name: 'غرفة 1' },
  startsAt: at(-40),
  endsAt: at(20),
  surgeonName: 'د. سامي',
  mine: false,
  startedAt: at(-30),
  procedure: null,
  notes: null,
  patient: null,
};

const room = (
  id: string,
  name: string,
  status: OrBoardRoom['status'],
  more: Partial<OrBoardRoom> = {},
): OrBoardRoom => ({
  id,
  name,
  status,
  statusChangedAt: at(-12),
  current: null,
  queue: [],
  sterilization: null,
  ...more,
});

let rooms: OrBoardRoom[];

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
  rooms = [
    room('r1', 'غرفة 1', 'IN_SURGERY', { current: operation }),
    room('r2', 'غرفة 2', 'STERILIZING', {
      sterilization: { status: 'IN_PROGRESS', by: 'أبو محمد' },
    }),
    room('r3', 'غرفة 3', 'AVAILABLE'),
    room('r4', 'غرفة 4', 'OUT_OF_SERVICE'),
  ];
  fake.respond((config) => {
    if (config.url === '/operating-rooms/live') return { status: 200, data: { rooms } };
    if (config.url?.endsWith('/service')) {
      const id = config.url.split('/')[2];
      const { outOfService } = JSON.parse(config.data as string);
      rooms = rooms.map((r) =>
        r.id === id ? { ...r, status: outOfService ? 'OUT_OF_SERVICE' : 'AVAILABLE' } : r,
      );
      return { status: 200, data: { operatingRoom: {} } };
    }
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('OrLivePage', () => {
  it('a doctor sees every room, its state and who is in it, without buttons', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('DOCTOR') });
    renderApp('/doctor/or-live');
    const surgery = await screen.findByLabelText('غرفة 1');
    expect(surgery).toHaveTextContent('قيد العملية');
    expect(surgery).toHaveTextContent('طارئة');
    expect(surgery).toHaveTextContent('عملية');
    expect(surgery).toHaveTextContent('د. سامي');
    expect(surgery).toHaveTextContent('مدة العملية 0:30');
    expect(surgery).toHaveTextContent('بهالحالة من 0:12');
    expect(screen.getByLabelText('غرفة 2')).toHaveTextContent('عم يعقّمها أبو محمد');
    expect(screen.getByLabelText('غرفة 3')).toHaveTextContent('فاضية، ما في شي عليها');
    expect(screen.getByLabelText('غرفة 4')).toHaveTextContent('خارج الخدمة للصيانة');
    const summary = screen.getByRole('list', { name: 'ملخص الغرف' });
    expect(summary).toHaveTextContent('قيد العملية · 1');
    expect(summary).toHaveTextContent('فارغة · 1');
    expect(screen.queryByRole('button', { name: 'إخراج من الخدمة' })).toBeNull();
  });

  it('the admin takes a free room out of service after confirming, and brings one back', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('ADMIN') });
    renderApp('/admin/or-live');
    const u = userEvent.setup();
    const free = await screen.findByLabelText('غرفة 3');
    expect(within(screen.getByLabelText('غرفة 1')).queryByRole('button')).toBeNull();
    await u.click(within(free).getByRole('button', { name: 'إخراج من الخدمة' }));
    const dialog = await screen.findByRole('dialog', { name: 'إخراج غرفة 3 من الخدمة؟' });
    await u.click(within(dialog).getByRole('button', { name: 'إخراج من الخدمة' }));

    expect(await screen.findByText('غرفة 3 صارت خارج الخدمة')).toBeInTheDocument();
    const patch = fake.calls.find((c) => c.method === 'patch')!;
    expect(patch.url).toBe('/operating-rooms/r3/service');
    expect(JSON.parse(patch.data as string)).toEqual({ outOfService: true });

    await u.click(
      within(screen.getByLabelText('غرفة 4')).getByRole('button', { name: 'إرجاع للخدمة' }),
    );
    const back = await screen.findByRole('dialog', { name: 'إرجاع غرفة 4 للخدمة؟' });
    await u.click(within(back).getByRole('button', { name: 'إرجاع للخدمة' }));
    expect(await screen.findByText('غرفة 4 رجعت للخدمة')).toBeInTheDocument();
  });

  it('updates by itself when a room changes', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('DOCTOR') });
    renderApp('/doctor/or-live');
    expect(await screen.findByLabelText('غرفة 3')).toHaveTextContent('فارغة');
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    rooms = rooms.map((r) =>
      r.id === 'r1' ? { ...r, status: 'AWAITING_STERILIZATION', current: null } : r,
    );
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['operating-rooms']] }));

    expect(
      await within(screen.getByLabelText('غرفة 1')).findByText('ناطرة فريق التعقيم'),
    ).toBeInTheDocument();
  });
});
