import type { ScheduleDay } from '@nabd/shared';
import { fireEvent, screen, within } from '@testing-library/react';
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

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'sami@amal.org',
  fullName: 'د. سامي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

let saved: ScheduleDay[];

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
  saved = [{ weekday: 6, startMinute: 480, endMinute: 840, slotMinutes: 20 }];
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/doctors/me/schedule' && config.method === 'put') {
      saved = JSON.parse(config.data as string).days;
      return { status: 200, data: { days: saved } };
    }
    if (config.url === '/doctors/me/schedule') return { status: 200, data: { days: saved } };
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

/** A day's card (the switch's own label also carries the day's name). */
const day = (name: string) => document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;

describe('SchedulePage (task 3.19)', () => {
  it('shows the saved week from Saturday, with each day’s visits', async () => {
    renderApp('/doctor/schedule');
    const week = await screen.findByRole('list', { name: 'أيام الأسبوع' });
    expect(within(week).getAllByRole('listitem')).toHaveLength(7);
    expect(within(week).getAllByRole('listitem')[0]).toHaveTextContent('السبت');
    const saturday = day('السبت');
    expect(within(saturday).getByRole('switch')).toBeChecked();
    expect(saturday).toHaveTextContent('18 موعد');
    expect(within(saturday).getByLabelText('السبت · من')).toHaveValue('08:00');
    expect(day('الأحد')).toHaveTextContent('عطلة');
    expect(screen.getByRole('radio', { name: '20 دقيقة' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'حفظ الدوام' })).toBeDisabled();
  });

  it('adds a day, copies hours, changes the visit length and saves', async () => {
    renderApp('/doctor/schedule');
    const user = userEvent.setup();
    await screen.findByRole('list', { name: 'أيام الأسبوع' });
    await user.click(within(day('الاثنين')).getByRole('switch'));
    await user.click(within(day('السبت')).getByRole('button', { name: 'نفس الساعات لكل الأيام' }));
    expect(within(day('الاثنين')).getByLabelText('الاثنين · لـ')).toHaveValue('14:00');
    await user.click(screen.getByRole('radio', { name: '30 دقيقة' }));
    expect(day('الاثنين')).toHaveTextContent('12 موعد');
    expect(screen.getByText('24 موعد بالأسبوع على 2 أيام')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حفظ الدوام' }));
    expect(await screen.findByText('انحفظ دوامك')).toBeInTheDocument();
    const put = fake.calls.find((c) => c.method === 'put')!;
    expect(JSON.parse(put.data as string).days).toEqual([
      { weekday: 6, startMinute: 480, endMinute: 840, slotMinutes: 30 },
      { weekday: 1, startMinute: 480, endMinute: 840, slotMinutes: 30 },
    ]);
  });

  it('says what is wrong with impossible hours and does not save them', async () => {
    renderApp('/doctor/schedule');
    await screen.findByRole('list', { name: 'أيام الأسبوع' });
    const to = within(day('السبت')).getByLabelText('السبت · لـ');
    fireEvent.change(to, { target: { value: '07:00' } });
    expect(day('السبت')).toHaveTextContent('وقت النهاية لازم يكون بعد البداية');
    expect(screen.getByRole('button', { name: 'حفظ الدوام' })).toBeDisabled();
    fireEvent.change(to, { target: { value: '08:10' } });
    expect(day('السبت')).toHaveTextContent('الوقت أقصر من زيارة وحدة');
  });
});
