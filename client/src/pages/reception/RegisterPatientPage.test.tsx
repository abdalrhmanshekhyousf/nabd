import type { ReceptionPatient } from '@nabd/shared';
import { fireEvent, screen, within } from '@testing-library/react';
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

const RECEPTION: SessionUser = {
  id: 'r1',
  email: 'desk@amal.org',
  fullName: 'هبة',
  role: 'RECEPTIONIST',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const patient = (more: Partial<ReceptionPatient>): ReceptionPatient => ({
  patientId: 'p1',
  fullName: 'عمر',
  isAnonymous: false,
  gender: 'MALE',
  dateOfBirth: null,
  phone: '0991234567',
  nationalId: '11223344',
  accountEmail: null,
  createdAt: new Date().toISOString(),
  ...more,
});

let registered: ReceptionPatient[];

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
  registered = [patient({})];
  useSessionStore.setState({ status: 'authenticated', user: RECEPTION });
  fake.respond((config) => {
    if (config.url === '/reception/patients' && config.method === 'post') {
      const body = JSON.parse(config.data as string);
      if (body.nationalId === '11223344') {
        return {
          status: 409,
          data: {
            error: {
              code: 'PATIENT_EXISTS',
              message: 'x',
              details: { patientId: 'p1', fullName: 'عمر' },
            },
          },
        };
      }
      if (body.account?.email === 'taken@mail.com')
        return apiError(409, 'EMAIL_TAKEN', 'في حساب بهالإيميل');
      const created = patient({
        patientId: 'p2',
        fullName: body.fullName,
        nationalId: body.nationalId || null,
        accountEmail: body.account?.email ?? null,
      });
      registered = [created, ...registered];
      return { status: 201, data: { patient: created } };
    }
    if (config.url === '/reception/patients/p1/account') {
      registered = [{ ...registered.at(-1)!, accountEmail: 'omar@mail.com' }];
      return { status: 201, data: { patient: registered[0] } };
    }
    if (config.url === '/reception/patients')
      return { status: 200, data: { patients: registered } };
    if (config.url === '/notifications')
      return { status: 200, data: { notifications: [], unread: 0 } };
    return { status: 200, data: {} };
  });
});

const posted = () =>
  JSON.parse(
    fake.calls.find((c) => c.method === 'post' && c.url === '/reception/patients')!.data as string,
  );

describe('RegisterPatientPage (task 4.1)', () => {
  it('registers a patient with an account and hands over the login once', async () => {
    renderApp('/reception/register');
    const user = userEvent.setup();
    const form = await screen.findByRole('region', { name: 'مريض جديد' });
    await user.click(within(form).getByRole('button', { name: 'تسجيل المريض' }));
    // The name and the gender are required.
    expect(within(form).getAllByText('هالحقل مطلوب')).toHaveLength(2);

    await user.type(within(form).getByLabelText(/الاسم الكامل/), 'سارة الأحمد');
    await user.click(within(form).getByRole('radio', { name: 'أنثى' }));
    fireEvent.change(within(form).getByLabelText('تاريخ الميلاد'), {
      target: { value: '1990-05-01' },
    });
    await user.type(within(form).getByLabelText('الحساسيات'), 'البنسلين');
    await user.type(within(form).getByLabelText('الإيميل'), 'sara@mail.com');
    const password = (within(form).getByLabelText(/كلمة السر/) as HTMLInputElement).value;
    expect(password.length).toBeGreaterThanOrEqual(12);
    await user.click(within(form).getByRole('button', { name: 'تسجيل المريض' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('sara@mail.com');
    expect(dialog).toHaveTextContent(password);
    expect(dialog).toHaveTextContent('سلّم هالبيانات للمريض');
    expect(posted()).toMatchObject({
      fullName: 'سارة الأحمد',
      gender: 'FEMALE',
      dateOfBirth: '1990-05-01',
      allergies: 'البنسلين',
      account: { email: 'sara@mail.com', password },
    });
  });

  it('a national number already registered points to that patient', async () => {
    renderApp('/reception/register');
    const user = userEvent.setup();
    const form = await screen.findByRole('region', { name: 'مريض جديد' });
    await user.type(within(form).getByLabelText(/الاسم الكامل/), 'عمر يوسف');
    await user.click(within(form).getByRole('radio', { name: 'ذكر' }));
    await user.type(within(form).getByLabelText('الرقم الوطني'), '11223344');
    await user.click(within(form).getByRole('switch'));
    await user.click(within(form).getByRole('button', { name: 'تسجيل المريض' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'في مريض مسجّل بهالرقم الوطني: عمر',
    );
    await user.click(within(form).getByRole('button', { name: 'وريني ياه' }));
    expect(screen.getByLabelText('ابحث بالاسم أو الهاتف أو الرقم الوطني')).toHaveValue('11223344');
  });

  it('opens an account for a registered patient without one', async () => {
    renderApp('/reception/register');
    const user = userEvent.setup();
    const results = await screen.findByRole('list', { name: 'نتائج البحث' });
    await user.click(
      within(within(results).getByLabelText('عمر')).getByRole('button', { name: 'فتح حساب' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'حساب لـ عمر' });
    await user.type(within(dialog).getByLabelText('الإيميل'), 'omar@mail.com');
    await user.click(within(dialog).getByRole('button', { name: 'فتح حساب' }));
    expect(await screen.findByRole('dialog', { name: /عمر/ })).toHaveTextContent('omar@mail.com');
  });
});
