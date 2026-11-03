import { screen, waitFor, within } from '@testing-library/react';
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
  email: 'lina@amal.org',
  fullName: 'لينا',
  role: 'NURSE',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

let canRegister = true;
let returning = false;

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
  canRegister = true;
  returning = false;
  useSessionStore.setState({ status: 'authenticated', user: NURSE });
  fake.respond((config) => {
    if (config.url === '/er/me') return { status: 200, data: { canRegister } };
    if (config.url === '/er/visits') {
      const body = JSON.parse(config.data as string);
      return {
        status: 201,
        data: {
          visit: {
            id: 'v1',
            patientName: body.anonymous ? null : body.fullName,
            isAnonymous: body.anonymous,
            returning,
            arrivedAt: new Date().toISOString(),
          },
        },
      };
    }
    if (config.url === '/notifications') {
      return { status: 200, data: { notifications: [], unread: 0 } };
    }
    return { status: 200, data: {} };
  });
});

const posted = () =>
  JSON.parse(fake.calls.find((c) => c.url === '/er/visits' && c.method === 'post')!.data as string);

describe('NewCasePage', () => {
  it('registers an unidentified arrival with just the complaint', async () => {
    renderApp('/nurse/new-case');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /مجهول الهوية/ }));
    await waitFor(() => expect(screen.queryByLabelText(/اسم المريض/)).toBeNull());
    await user.click(screen.getByRole('radio', { name: 'ذكر' }));
    await user.type(screen.getByLabelText(/سبب القدوم/), 'غياب وعي');
    await user.type(screen.getByLabelText(/ملاحظات الوصول/), 'رجل حوالي 40');
    await user.click(screen.getByRole('button', { name: 'تسجيل الحالة' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('مريض مجهول الهوية صار بقائمة الانتظار');
    expect(posted()).toEqual({
      anonymous: true,
      gender: 'MALE',
      chiefComplaint: 'غياب وعي',
      arrivalNote: 'رجل حوالي 40',
    });
  });

  it('asks a known patient for a name, then a fresh form for the next one', async () => {
    renderApp('/nurse/new-case');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تسجيل الحالة' }));
    expect(await screen.findAllByText('هالحقل مطلوب')).toHaveLength(2);

    await user.type(screen.getByLabelText(/اسم المريض/), 'سارة الأحمد');
    await user.type(screen.getByLabelText(/الرقم الوطني/), '01020304');
    await user.type(screen.getByLabelText(/سبب القدوم/), 'ألم بطن');
    await user.click(screen.getByRole('button', { name: 'تسجيل الحالة' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('سارة الأحمد صار بقائمة الانتظار');
    expect(posted()).toMatchObject({
      anonymous: false,
      fullName: 'سارة الأحمد',
      nationalId: '01020304',
      phone: null,
      dateOfBirth: null,
      gender: null,
    });

    await user.click(within(status).getByRole('button', { name: 'تسجيل حالة تانية' }));
    expect(await screen.findByLabelText(/اسم المريض/)).toHaveValue('');
  });

  it('says when a returning patient’s file was found', async () => {
    returning = true;
    renderApp('/nurse/new-case');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/اسم المريض/), 'سارة');
    await user.type(screen.getByLabelText(/سبب القدوم/), 'دوخة');
    await user.click(screen.getByRole('button', { name: 'تسجيل الحالة' }));

    expect(await screen.findByRole('status')).toHaveTextContent('سارة إجا قبل');
  });

  it('tells a nurse outside the emergency room that this page is not theirs', async () => {
    canRegister = false;
    renderApp('/nurse/new-case');

    expect(await screen.findByText('هالصفحة لممرضين الإسعاف')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تسجيل الحالة' })).toBeNull();
  });
});
