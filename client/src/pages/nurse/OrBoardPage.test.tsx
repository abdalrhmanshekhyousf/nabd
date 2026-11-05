import type { BookingView, OrBoardRoom } from '@nabd/shared';
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

const NURSE: SessionUser = {
  id: 'n1',
  email: 'rami@amal.org',
  fullName: 'رامي',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function booking(id: string, procedure: string, overrides: Partial<BookingView> = {}): BookingView {
  return {
    id,
    kind: 'SCHEDULED',
    status: 'SCHEDULED',
    operatingRoom: { id: 'r1', name: 'غرفة 1' },
    startsAt: at(20),
    endsAt: at(80),
    surgeonName: 'د. سامي',
    mine: false,
    startedAt: null,
    procedure,
    notes: null,
    patient: {
      id: `p-${id}`,
      fullName: 'سارة',
      isAnonymous: false,
      gender: null,
      dateOfBirth: null,
    },
    ...overrides,
  };
}

const room = (
  id: string,
  name: string,
  status: OrBoardRoom['status'],
  more: Partial<OrBoardRoom> = {},
): OrBoardRoom => ({
  id,
  name,
  status,
  statusChangedAt: new Date().toISOString(),
  current: null,
  queue: [],
  ...more,
});

let board: OrBoardRoom[];
let forbidden: boolean;

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
  forbidden = false;
  board = [
    room('r1', 'غرفة 1', 'BOOKED', {
      queue: [
        booking('e1', 'فتح بطن', { kind: 'EMERGENCY', startsAt: at(0) }),
        booking('b1', 'استئصال زائدة'),
      ],
    }),
    room('r2', 'غرفة 2', 'IN_SURGERY', {
      current: booking('b2', 'تنظير ركبة', {
        status: 'IN_PROGRESS',
        startsAt: at(-70),
        startedAt: at(-65),
        notes: 'حساسية من البنسلين',
      }),
    }),
    room('r3', 'غرفة 3', 'AWAITING_STERILIZATION'),
  ];
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/operating-rooms/board') {
      return forbidden
        ? { status: 403, data: { error: { code: 'FORBIDDEN', message: 'no' } } }
        : { status: 200, data: { rooms: board } };
    }
    const step = config.url?.match(/^\/operating-rooms\/(.+)\/transition$/);
    if (step) return { status: 200, data: { operatingRoom: {} } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const postOf = (roomId: string) =>
  JSON.parse(
    fake.calls.find((c) => c.url === `/operating-rooms/${roomId}/transition`)!.data as string,
  );

describe('OrBoardPage', () => {
  it('shows each room’s stage, the operation in it and what waits, emergencies first', async () => {
    renderApp('/nurse/operating-rooms');
    const room1 = await screen.findByLabelText('غرفة 1');
    expect(room1).toHaveTextContent('الجاي');
    expect(room1).toHaveTextContent('طارئة');
    expect(room1).toHaveTextContent('فتح بطن');
    expect(within(room1).getByText('بالانتظار').parentElement).toHaveTextContent('استئصال زائدة');
    expect(within(room1).getByText('محجوزة', { selector: '[aria-current]' })).toBeInTheDocument();

    const room2 = screen.getByLabelText('غرفة 2');
    expect(room2).toHaveTextContent('هلق');
    expect(room2).toHaveTextContent('مدة العملية 1:05');
    expect(room2).toHaveTextContent('حساسية من البنسلين');
    expect(within(room2).getByRole('button', { name: 'إنهاء العملية' })).toBeInTheDocument();

    const room3 = screen.getByLabelText('غرفة 3');
    expect(room3).toHaveTextContent('بانتظار فريق التعقيم');
    expect(within(room3).queryByRole('button')).toBeNull();
  });

  it('prepares the room for the booking the nurse picks', async () => {
    renderApp('/nurse/operating-rooms');
    const user = userEvent.setup();
    const room1 = await screen.findByLabelText('غرفة 1');
    await user.selectOptions(within(room1).getByRole('combobox', { name: 'تحضير لـ' }), 'b1');
    expect(room1).toHaveTextContent('استئصال زائدة');
    await user.click(within(room1).getByRole('button', { name: 'بدء التحضير' }));

    expect(await screen.findByText('بلّش تحضير غرفة 1')).toBeInTheDocument();
    expect(postOf('r1')).toEqual({ to: 'PREPARING', bookingId: 'b1' });
  });

  it('ending an operation asks first, then sends the room to sterilization', async () => {
    renderApp('/nurse/operating-rooms');
    const user = userEvent.setup();
    const room2 = await screen.findByLabelText('غرفة 2');
    await user.click(within(room2).getByRole('button', { name: 'إنهاء العملية' }));
    const dialog = await screen.findByRole('dialog', { name: 'إنهاء تنظير ركبة؟' });
    expect(dialog).toHaveTextContent('غرفة 2 رح تصير بانتظار التعقيم');
    expect(fake.calls.some((c) => c.method === 'post')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'إنهاء العملية' }));
    expect(
      await screen.findByText('خلصت العملية بـ غرفة 2، والغرفة بانتظار التعقيم'),
    ).toBeInTheDocument();
    expect(postOf('r2')).toEqual({ to: 'AWAITING_STERILIZATION' });
  });

  it('tells nurses outside the operating rooms that the board is not theirs', async () => {
    forbidden = true;
    renderApp('/nurse/operating-rooms');
    expect(await screen.findByText('هالشاشة لفريق العمليات')).toBeInTheDocument();
  });
});
