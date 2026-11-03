import type { DoctorStatus } from '@nabd/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/app/queryClient';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { apiError, fakeApi } from '@/test/fakeApi';
import { fakeSockets, lastSocket } from '@/test/fakeSocket';
import { renderApp } from '@/test/renderApp';

const fake = fakeApi(api);

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'u1',
  email: 'reem@amal.org',
  fullName: 'د. ريم',
  role,
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
});

let status: DoctorStatus;
let refuse = false;

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
  status = 'AVAILABLE';
  refuse = false;
  useSessionStore.setState({ status: 'authenticated', user: user('DOCTOR') });
  fake.respond((config) => {
    if (config.url === '/doctors/me/status') {
      if (config.method === 'patch') {
        if (refuse) return apiError(500, 'INTERNAL_ERROR', 'صار خطأ');
        status = JSON.parse(config.data as string).status;
      }
      return { status: 200, data: { status } };
    }
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

const statusButton = () => screen.findByRole('button', { name: /^حالتك:/ });

describe('DoctorStatusMenu', () => {
  it('shows the doctor their status', async () => {
    renderApp('/doctor');
    expect(await statusButton()).toHaveAccessibleName('حالتك: متفرّغ');
  });

  it('is not shown to other roles', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('NURSE') });
    renderApp('/nurse');

    await screen.findByRole('button', { name: /^الإشعارات/ });
    expect(screen.queryByRole('button', { name: /^حالتك:/ })).toBeNull();
    expect(fake.calls.some((c) => c.url === '/doctors/me/status')).toBe(false);
  });

  it('changes the status at once and saves it', async () => {
    renderApp('/doctor');
    const u = userEvent.setup();
    await u.click(await statusButton());
    const group = await screen.findByRole('radiogroup', { name: 'حالتي' });
    expect(within(group).getByRole('radio', { name: /متفرّغ/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await u.click(within(group).getByRole('radio', { name: /مشغول/ }));

    expect(await statusButton()).toHaveAccessibleName('حالتك: مشغول');
    expect(await screen.findByText('صارت حالتك: مشغول')).toBeInTheDocument();
    const patch = fake.calls.find((c) => c.method === 'patch')!;
    expect(JSON.parse(patch.data as string)).toEqual({ status: 'BUSY' });
  });

  it('goes back if the server refuses', async () => {
    refuse = true;
    renderApp('/doctor');
    const u = userEvent.setup();
    await u.click(await statusButton());

    await u.click(await screen.findByRole('radio', { name: /عطلة/ }));

    await waitFor(async () => expect(await statusButton()).toHaveAccessibleName('حالتك: متفرّغ'));
  });

  it('follows a change made on another device', async () => {
    renderApp('/doctor');
    await statusButton();
    await waitFor(() => expect(fakeSockets).toHaveLength(1));

    status = 'ON_LEAVE';
    act(() => lastSocket().fromServer('refresh', { queryKeys: [['doctor-status']] }));

    await waitFor(async () => expect(await statusButton()).toHaveAccessibleName('حالتك: عطلة'));
  });
});
