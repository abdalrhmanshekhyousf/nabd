import type { DoctorScheduleView } from '@nabd/shared';
import { act, screen, waitFor } from '@testing-library/react';
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

const DOCTOR: SessionUser = {
  id: 'd1',
  email: 'sami@amal.org',
  fullName: 'د. سامي',
  role: 'DOCTOR',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

let current: DoctorScheduleView;

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
  current = { days: [{ weekday: 6, startMinute: 480, endMinute: 840 }], visitMinutes: 20 };
  useSessionStore.setState({ status: 'authenticated', user: DOCTOR });
  fake.respond((config) => {
    if (config.url === '/doctors/me/visit-length') {
      current = { ...current, visitMinutes: JSON.parse(config.data as string).visitMinutes };
      return { status: 200, data: current };
    }
    if (config.url === '/doctors/me/schedule') return { status: 200, data: current };
    if (config.url === '/doctors/me/status') return { status: 200, data: { status: 'AVAILABLE' } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const day = (name: string) => document.querySelector<HTMLElement>(`li[aria-label="${name}"]`)!;

describe('SchedulePage (task 3.19)', () => {
  it('shows the week the admin set, from Saturday, read-only', async () => {
    renderApp('/doctor/schedule');
    await screen.findByText('الأيام والساعات بيحددها المدير.');
    const days = [...document.querySelectorAll('li[aria-label]')].map((li) =>
      li.getAttribute('aria-label'),
    );
    expect(days[0]).toBe('السبت');
    expect(days).toHaveLength(7);
    expect(day('السبت')).toHaveTextContent('08:00 – 14:00');
    expect(day('السبت')).toHaveTextContent('18 موعد');
    expect(day('الأحد')).toHaveTextContent('عطلة');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('the doctor changes the visit length, and the counts follow', async () => {
    renderApp('/doctor/schedule');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: '30 دقيقة' }));
    expect(await screen.findByText('صارت مدة الزيارة 30 دقيقة')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 دقيقة' })).toBeChecked();
    expect(day('السبت')).toHaveTextContent('12 موعد');
    expect(JSON.parse(fake.calls.find((c) => c.method === 'put')!.data as string)).toEqual({
      visitMinutes: 30,
    });
  });

  it('updates live when the admin changes the hours', async () => {
    renderApp('/doctor/schedule');
    await screen.findByText('الأيام والساعات بيحددها المدير.');
    await waitFor(() => expect(fakeSockets).toHaveLength(1));
    current = { ...current, days: [{ weekday: 0, startMinute: 600, endMinute: 720 }] };
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['schedule']] }));
    await waitFor(() => expect(day('الأحد')).toHaveTextContent('10:00 – 12:00'));
    expect(day('السبت')).toHaveTextContent('عطلة');
  });
});
