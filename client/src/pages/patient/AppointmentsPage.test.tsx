import type { AppointmentView } from '@nabd/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const PATIENT: SessionUser = {
  id: 'u1',
  email: 'sara@mail.com',
  fullName: 'سارة',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const CARDIO = { id: 'dep1', name: 'Cardio', code: 'CARDIOLOGY' as const };
// 08:00 and 08:30 in Damascus (UTC+3) on Saturday 14 Nov 2026.
const S1 = { startsAt: '2026-11-14T05:00:00.000Z', endsAt: '2026-11-14T05:30:00.000Z' };
const S2 = { startsAt: '2026-11-14T05:30:00.000Z', endsAt: '2026-11-14T06:00:00.000Z' };

const visit = (more: Partial<AppointmentView>): AppointmentView => ({
  id: 'a1',
  doctorId: 'doc1',
  doctorName: 'د. سامي',
  patientId: 'p1',
  startsAt: S1.startsAt,
  endsAt: S1.endsAt,
  status: 'BOOKED',
  reason: null,
  cancelReason: null,
  department: CARDIO,
  ...more,
});

let upcoming: AppointmentView[];
let past: AppointmentView[];
let taken = false;

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
  taken = false;
  upcoming = [];
  past = [visit({ id: 'old', status: 'CANCELLED', cancelReason: 'DOCTOR_LEAVE' })];
  useSessionStore.setState({ status: 'authenticated', user: PATIENT });
  fake.respond((config) => {
    if (config.url === '/appointments/mine') return { status: 200, data: { upcoming, past } };
    if (config.url === '/appointments/departments') {
      return { status: 200, data: { departments: [{ ...CARDIO, doctorCount: 2 }] } };
    }
    if (config.url === '/appointments/doctors') {
      return {
        status: 200,
        data: {
          doctors: [
            {
              id: 'doc1',
              fullName: 'د. سامي',
              specialty: 'قلبية',
              visitMinutes: 30,
              nextSlot: S1.startsAt,
            },
            {
              id: 'doc2',
              fullName: 'د. لينا',
              specialty: 'قلبية',
              visitMinutes: 20,
              nextSlot: null,
            },
          ],
        },
      };
    }
    if (config.url === '/appointments/slots') {
      return {
        status: 200,
        data: { days: [{ date: '2026-11-14', weekday: 6, slots: taken ? [S2] : [S1, S2] }] },
      };
    }
    if (config.url === '/appointments' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      if (body.startsAt === S1.startsAt && taken)
        return apiError(409, 'SLOT_TAKEN', 'حدا حجز هالموعد هلق');
      const booked = visit({ id: 'new', startsAt: body.startsAt, reason: body.reason || null });
      upcoming = [booked];
      return { status: 201, data: { appointment: booked } };
    }
    if (config.method === 'delete') {
      upcoming = [];
      return { status: 200, data: { appointment: visit({ status: 'CANCELLED' }) } };
    }
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('AppointmentsPage (task 3.22)', () => {
  it('books department → doctor → day and time, in hospital time', async () => {
    renderApp('/patient/appointments');
    const user = userEvent.setup();
    expect(await screen.findByText('ما عندك مواعيد جاية.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حجز موعد' }));
    const wizard = await screen.findByLabelText('حجز موعد', { selector: 'section' });

    await user.click(await within(wizard).findByRole('button', { name: /القلبية/ }));
    const sami = await within(wizard).findByRole('button', { name: /د. سامي/ });
    expect(sami).toHaveTextContent('أقرب موعد');
    // A doctor with no free time cannot be picked.
    expect(within(wizard).getByRole('button', { name: /د. لينا/ })).toBeDisabled();
    await user.click(sami);

    const times = await within(wizard).findByRole('radiogroup', { name: 'الوقت' });
    const radios = within(times).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['8:00 ص', '8:30 ص']);
    await user.click(radios[1]!);
    await user.type(within(wizard).getByLabelText(/سبب الزيارة/), 'خفقان');
    await user.click(within(wizard).getByRole('button', { name: 'تأكيد الحجز' }));

    expect(await within(wizard).findByText('انحجز موعدك')).toBeInTheDocument();
    expect(JSON.parse(fake.calls.find((c) => c.method === 'post')!.data as string)).toEqual({
      doctorId: 'doc1',
      startsAt: S2.startsAt,
      reason: 'خفقان',
    });
    await user.click(within(wizard).getByRole('button', { name: 'مواعيدي' }));
    const coming = await screen.findByRole('region', { name: 'المواعيد الجاية' });
    expect(await within(coming).findByText(/د. سامي/)).toBeInTheDocument();
  });

  it('a slot taken meanwhile is refused and disappears', async () => {
    renderApp('/patient/appointments?book=1');
    const user = userEvent.setup();
    const wizard = await screen.findByLabelText('حجز موعد', { selector: 'section' });
    await user.click(await within(wizard).findByRole('button', { name: /القلبية/ }));
    await user.click(await within(wizard).findByRole('button', { name: /د. سامي/ }));
    const times = await within(wizard).findByRole('radiogroup', { name: 'الوقت' });
    await user.click(within(times).getAllByRole('radio')[0]!);
    taken = true;
    await user.click(within(wizard).getByRole('button', { name: 'تأكيد الحجز' }));
    expect(await screen.findByText('حدا حجز هالموعد هلق')).toBeInTheDocument();
    await within(wizard).findByText('8:30 ص');
    expect(
      within(times)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['8:30 ص']);
  });

  it('cancels a coming visit after asking, and books again after a vacation cancelled one', async () => {
    upcoming = [visit({})];
    renderApp('/patient/appointments');
    const user = userEvent.setup();
    const coming = await screen.findByRole('region', { name: 'المواعيد الجاية' });
    await user.click(within(coming).getByRole('button', { name: 'إلغاء' }));
    const dialog = await screen.findByRole('dialog', { name: 'إلغاء الموعد؟' });
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء الموعد' }));
    expect(await screen.findByText('انلغى الموعد')).toBeInTheDocument();

    const pastList = screen.getByRole('region', { name: 'المواعيد السابقة' });
    expect(pastList).toHaveTextContent('انلغى لأن الطبيب بإجازة');
    await user.click(within(pastList).getByRole('button', { name: 'احجز من جديد' }));
    const wizard = await screen.findByLabelText('حجز موعد', { selector: 'section' });
    // Straight to the doctor's times.
    expect(await within(wizard).findByRole('radiogroup', { name: 'الوقت' })).toBeInTheDocument();
    expect(wizard).toHaveTextContent('د. سامي');
  });
});
