import type { BookingView, PatientSummary } from '@nabd/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import type { OperatingRoom } from '@/components/operatingRooms/orStyles';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { addDays, atTime, dayKey, dayRange } from '@/lib/day';
import { useSessionStore } from '@/stores/sessionStore';
import { fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);
const R1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'sami@amal.org',
  fullName: 'د. سامي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const tomorrow = addDays(dayKey(), 1);
const ROOMS: OperatingRoom[] = [
  { id: R1, name: 'غرفة 1', status: 'BOOKED', statusChangedAt: new Date().toISOString() },
  { id: 'r2', name: 'غرفة 2', status: 'AVAILABLE', statusChangedAt: new Date().toISOString() },
  { id: 'r3', name: 'غرفة 3', status: 'OUT_OF_SERVICE', statusChangedAt: new Date().toISOString() },
];
const PATIENT: PatientSummary = {
  patientId: P1,
  fullName: 'سارة',
  isAnonymous: false,
  gender: 'FEMALE',
  dateOfBirth: null,
  phone: null,
  reportCount: 0,
  prescriptionCount: 0,
  lastReportAt: null,
};

function booking(
  id: string,
  day: string,
  from: string,
  to: string,
  overrides: Partial<BookingView> = {},
): BookingView {
  return {
    id,
    kind: 'SCHEDULED',
    status: 'SCHEDULED',
    operatingRoom: { id: R1, name: 'غرفة 1' },
    startsAt: atTime(day, from),
    endsAt: atTime(day, to),
    surgeonName: 'د. نور',
    mine: false,
    procedure: null,
    patient: null,
    ...overrides,
  };
}

const MINE = booking('b1', tomorrow, '08:00', '09:00', {
  surgeonName: 'د. سامي',
  mine: true,
  procedure: 'استئصال زائدة',
  patient: { id: P1, fullName: 'سارة', isAnonymous: false, gender: 'FEMALE', dateOfBirth: null },
});
let byDay: Record<string, BookingView[]>;
let mine: BookingView[];

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
  byDay = { [tomorrow]: [MINE, booking('b2', tomorrow, '10:00', '12:00')] };
  mine = [MINE];
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/operating-rooms') return { status: 200, data: { operatingRooms: ROOMS } };
    if (config.url === '/bookings' && config.method === 'get') {
      const day = Object.keys(byDay).find(
        (key) => dayRange(key).from === (config.params as { from: string }).from,
      );
      return { status: 200, data: { bookings: day ? byDay[day] : [] } };
    }
    if (config.url === '/bookings/mine') return { status: 200, data: { bookings: mine } };
    if (config.url === '/doctors/me/patients')
      return { status: 200, data: { patients: [PATIENT] } };
    if (config.url === '/bookings' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      const created = booking('b3', tomorrow, '13:00', '14:30', {
        operatingRoom: { id: body.operatingRoomId, name: 'غرفة 1' },
        startsAt: body.startsAt,
        mine: true,
        procedure: body.procedure,
      });
      return { status: 201, data: { booking: created } };
    }
    if (config.url === '/bookings/b1' && config.method === 'delete') {
      mine = [];
      byDay = { [tomorrow]: byDay[tomorrow]!.filter((b) => b.id !== 'b1') };
      return { status: 200, data: { booking: { ...MINE, status: 'CANCELLED' } } };
    }
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const goToTomorrow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'اليوم التالي' }));
  return screen.findByRole('button', { name: 'اليوم' });
};

describe('OrBookingsPage', () => {
  it('shows each room’s day: my booking in full, another doctor’s only as taken', async () => {
    renderApp('/doctor/or-bookings');
    const user = userEvent.setup();
    expect(await screen.findByLabelText('غرفة 2')).toHaveTextContent('فاضية كل اليوم');
    await goToTomorrow(user);

    const room1 = screen.getByLabelText('غرفة 1');
    expect(await within(room1).findByText(/حجزك · استئصال زائدة · سارة/)).toBeInTheDocument();
    expect(within(room1).getByText('محجوز · د. نور')).toBeInTheDocument();
    expect(within(room1).getByText('محجوزة')).toBeInTheDocument();
    expect(screen.getByLabelText('غرفة 3')).toHaveTextContent('خارج الخدمة');
    expect(screen.getByRole('region', { name: 'حجوزاتي الجاية' })).toHaveTextContent(
      'استئصال زائدة · سارة',
    );

    await user.click(screen.getByRole('button', { name: 'اليوم' }));
    expect(await screen.findByLabelText('غرفة 1')).toHaveTextContent('فاضية كل اليوم');
  });

  it('booking warns about a clash live, then sends a free slot', async () => {
    renderApp('/doctor/or-bookings');
    const user = userEvent.setup();
    await goToTomorrow(user);
    await user.click(screen.getByRole('button', { name: 'حجز جديد' }));
    const dialog = await screen.findByRole('dialog', { name: 'حجز غرفة عمليات' });

    const rooms = within(dialog).getByRole('combobox', { name: /الغرفة/ });
    expect(within(rooms).queryByRole('option', { name: 'غرفة 3' })).not.toBeInTheDocument();
    await user.selectOptions(
      await within(dialog).findByRole('combobox', { name: /المريض/ }),
      await within(dialog).findByRole('option', { name: 'سارة' }),
    );
    await user.selectOptions(rooms, R1);
    expect(await within(dialog).findByText('حجوزات غرفة 1 بهاليوم')).toBeInTheDocument();

    const time = within(dialog).getByLabelText(/الساعة/);
    await user.clear(time);
    await user.type(time, '10:30');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/متعارض مع حجز/);
    expect(within(dialog).getByRole('button', { name: 'تأكيد الحجز' })).toBeDisabled();

    await user.clear(time);
    await user.type(time, '13:00');
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /المدة/ }), '90');
    expect(within(dialog).getByRole('option', { name: 'ساعة ونص' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'ساعتين' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '3 ساعات' })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/العملية/), 'تنظير ركبة');
    await user.click(within(dialog).getByRole('button', { name: 'تأكيد الحجز' }));

    expect(await screen.findByText(/انحجزت غرفة 1/)).toBeInTheDocument();
    const post = fake.calls.find((c) => c.url === '/bookings' && c.method === 'post')!;
    expect(JSON.parse(post.data as string)).toEqual({
      operatingRoomId: R1,
      patientId: P1,
      procedure: 'تنظير ركبة',
      startsAt: atTime(tomorrow, '13:00'),
      durationMinutes: 90,
      notes: '',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'حجز غرفة عمليات' })).not.toBeInTheDocument(),
    );
  });

  it('cancelling my booking asks first, then frees the slot', async () => {
    renderApp('/doctor/or-bookings');
    const user = userEvent.setup();
    const upcoming = await screen.findByRole('region', { name: 'حجوزاتي الجاية' });
    await user.click(await within(upcoming).findByRole('button', { name: 'إلغاء الحجز' }));
    const dialog = await screen.findByRole('dialog', { name: 'إلغاء حجز استئصال زائدة؟' });
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء الحجز' }));

    expect(await screen.findByText('انلغى الحجز')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.url === '/bookings/b1' && c.method === 'delete')).toBe(true);
    expect(await within(upcoming).findByText('ما عندك حجوزات جاية')).toBeInTheDocument();
  });
});
