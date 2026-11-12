import {
  addLocalDays,
  zonedDate,
  zonedInstant,
  type AppointmentView,
  type DeskAppointment,
  type ReceptionPatient,
} from '@nabd/shared';
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

const RECEPTION: SessionUser = {
  id: 'r1',
  email: 'desk@amal.org',
  fullName: 'هبة',
  role: 'RECEPTIONIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const OMAR: ReceptionPatient = {
  patientId: 'p1',
  fullName: 'عمر',
  isAnonymous: false,
  gender: 'MALE',
  dateOfBirth: null,
  phone: '0991234567',
  nationalId: null,
  accountEmail: null,
  createdAt: new Date().toISOString(),
};

const today = zonedDate(new Date());
const tomorrow = addLocalDays(today, 1);
const slot = zonedInstant(tomorrow, 9 * 60).toISOString();
// Still to come, so it can be cancelled.
const later = new Date(Date.now() + 3_600_000).toISOString();

const visit = (more: Partial<AppointmentView>): AppointmentView => ({
  id: 'a1',
  doctorId: 'd1',
  doctorName: 'د. سامي',
  patientId: 'p2',
  startsAt: later,
  endsAt: later,
  status: 'BOOKED',
  reason: null,
  cancelReason: null,
  department: { id: 'dep1', name: 'القلبية', code: 'CARDIOLOGY' },
  ...more,
});

let day: DeskAppointment[];
let omarVisits: AppointmentView[];

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
  day = [
    {
      ...visit({}),
      patient: { fullName: 'سارة', isAnonymous: false, phone: '0944111222' },
    },
  ];
  omarVisits = [];
  useSessionStore.setState({ status: 'authenticated', user: RECEPTION });
  fake.respond((config) => {
    if (config.url === '/reception/patients') return { status: 200, data: { patients: [OMAR] } };
    if (config.url === '/appointments/day')
      return {
        status: 200,
        data: { appointments: config.params?.date === today ? day : [] },
      };
    if (config.url === '/appointments/patient/p1')
      return { status: 200, data: { upcoming: omarVisits, past: [] } };
    if (config.url === '/appointments/departments')
      return {
        status: 200,
        data: {
          departments: [{ id: 'dep1', name: 'القلبية', code: 'CARDIOLOGY', doctorCount: 1 }],
        },
      };
    if (config.url === '/appointments/doctors')
      return {
        status: 200,
        data: {
          doctors: [
            {
              id: 'd1',
              fullName: 'د. سامي',
              specialty: 'قلبية',
              visitMinutes: 30,
              nextSlot: slot,
            },
          ],
        },
      };
    if (config.url === '/appointments/slots')
      return {
        status: 200,
        data: { days: [{ date: tomorrow, weekday: 0, slots: [{ startsAt: slot, endsAt: slot }] }] },
      };
    if (config.url === '/appointments' && config.method === 'post') {
      const booked = visit({ id: 'a2', patientId: 'p1', startsAt: slot });
      omarVisits = [booked];
      return { status: 201, data: { appointment: booked } };
    }
    if (config.url === '/appointments/a1' && config.method === 'delete') {
      day = [{ ...day[0]!, status: 'CANCELLED', cancelReason: 'RECEPTION' }];
      return { status: 200, data: { appointment: day[0] } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('DeskAppointmentsPage (task 4.2)', () => {
  it('books a visit for the chosen patient', async () => {
    renderApp('/reception/appointments');
    const user = userEvent.setup();
    const results = await screen.findByRole('list', { name: 'نتائج البحث' });
    await user.click(within(results).getByRole('button', { name: /عمر/ }));
    expect(await screen.findByText('ما عندو مواعيد جاية.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'حجز موعد لـ عمر' }));
    expect(screen.getByRole('heading', { name: 'موعد لـ عمر' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /القلبية/ }));
    await user.click(await screen.findByRole('button', { name: /د. سامي/ }));
    await user.click((await screen.findAllByRole('radio'))[0]!);
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));

    expect(await screen.findByText('انحجز الموعد لـ عمر')).toBeInTheDocument();
    const post = fake.calls.find((c) => c.method === 'post' && c.url === '/appointments')!;
    expect(JSON.parse(post.data as string)).toMatchObject({
      doctorId: 'd1',
      patientId: 'p1',
      startsAt: slot,
    });
    await user.click(screen.getByRole('button', { name: 'تمام' }));
    const theirs = await screen.findByRole('region', { name: 'مواعيدو الجاية' });
    expect(await within(theirs).findByText(/د. سامي/)).toBeInTheDocument();
  });

  it('lists the day with who is coming, and cancels a visit', async () => {
    renderApp('/reception/appointments');
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'مواعيد هاليوم' });
    const row = within(list).getByRole('listitem', { name: /سارة/ });
    expect(row).toHaveTextContent('0944111222');
    expect(row).toHaveTextContent('محجوز');

    await user.click(within(row).getByRole('button', { name: 'إلغاء' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('موعد سارة مع د. سامي');
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء الموعد' }));
    expect(await within(list).findByText('ملغى', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === 'delete' && c.url === '/appointments/a1')).toBe(
      true,
    );

    // The next day is empty.
    await user.click(screen.getByRole('button', { name: 'اليوم اللي بعد' }));
    expect(await screen.findByText('ما في مواعيد بهاليوم.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'اليوم' }));
    expect(await screen.findByRole('list', { name: 'مواعيد هاليوم' })).toBeInTheDocument();
  });
});
