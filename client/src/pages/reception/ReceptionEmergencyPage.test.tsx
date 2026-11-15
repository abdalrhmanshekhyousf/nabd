import type { ReceptionPatient } from '@nabd/shared';
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

const UNKNOWN: ReceptionPatient = {
  patientId: 'p9',
  fullName: null,
  isAnonymous: true,
  gender: 'MALE',
  dateOfBirth: null,
  phone: null,
  nationalId: null,
  accountEmail: null,
  createdAt: new Date().toISOString(),
};

let unknown: ReceptionPatient[];

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
  unknown = [UNKNOWN];
  useSessionStore.setState({ status: 'authenticated', user: RECEPTION });
  fake.respond((config) => {
    if (config.url === '/reception/er-arrivals')
      return {
        status: 201,
        data: {
          visit: {
            id: 'v1',
            patientId: 'p10',
            patientName: null,
            isAnonymous: true,
            returning: false,
            status: 'WAITING',
            arrivedAt: new Date().toISOString(),
          },
        },
      };
    if (config.url === '/reception/patients/p9/identify') {
      unknown = [];
      return {
        status: 200,
        data: {
          merged: true,
          patient: {
            ...UNKNOWN,
            patientId: 'p1',
            fullName: 'سارة الأحمد',
            isAnonymous: false,
            accountEmail: null,
          },
        },
      };
    }
    if (config.url === '/reception/patients') return { status: 200, data: { patients: unknown } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

describe('ReceptionEmergencyPage (task 4.3)', () => {
  it('sends an unidentified arrival to the ER from the desk', async () => {
    renderApp('/reception/emergency');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /مجهول الهوية/ }));
    await user.type(screen.getByLabelText(/سبب القدوم/), 'حادث سير');
    await user.click(screen.getByRole('button', { name: 'تسجيل الحالة' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'المريض المجهول صار عند ممرضين الإسعاف',
    );
    const post = fake.calls.find((c) => c.url === '/reception/er-arrivals')!;
    expect(JSON.parse(post.data as string)).toMatchObject({
      anonymous: true,
      chiefComplaint: 'حادث سير',
    });
  });

  it('identifies an unidentified patient, joining the file they already had', async () => {
    renderApp('/reception/emergency');
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'مرضى مجهولين' });
    await user.click(within(list).getByRole('button', { name: 'تعريف' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعريف المريض' });
    await user.click(within(dialog).getByRole('button', { name: 'تعريف' }));
    expect(within(dialog).getByText('هالحقل مطلوب')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/الاسم الكامل/), 'سارة');
    await user.type(within(dialog).getByLabelText(/الرقم الوطني/), '11112222');
    await user.click(within(dialog).getByRole('button', { name: 'تعريف' }));

    expect(
      await screen.findAllByText('طلع مسجّل من قبل: انضم ملفو لملف سارة الأحمد'),
    ).not.toHaveLength(0);
    const sent = fake.calls.find((c) => c.url === '/reception/patients/p9/identify')!;
    expect(JSON.parse(sent.data as string)).toMatchObject({
      fullName: 'سارة',
      gender: 'MALE',
      nationalId: '11112222',
    });
    expect(await screen.findByText('ما في مرضى مجهولين.')).toBeInTheDocument();
    // No account yet: one can be opened from here.
    expect(screen.getByRole('button', { name: 'فتح حساب' })).toBeInTheDocument();
  });
});
