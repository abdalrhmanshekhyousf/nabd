import { screen, waitFor, within } from '@testing-library/react';
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

const HOSPITALS = [
  { id: '0199a3d2-6c55-7000-8000-000000000001', name: 'دار الشفاء', address: 'دمشق' },
  { id: '0199a3d2-6c55-7000-8000-000000000002', name: 'مشفى الأمل', address: 'حلب' },
];

const PATIENT: SessionUser = {
  id: 'p1',
  email: 'sara@mail.com',
  fullName: 'سارة الأحمد',
  role: 'PATIENT',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: HOSPITALS[1].id, name: 'مشفى الأمل', logoUrl: null },
};

let taken = false;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  fake.calls.length = 0;
  taken = false;
  queryClient.clear();
  useSessionStore.setState({ status: 'anonymous', user: null });
  fake.respond((config) => {
    if (config.url === '/public/hospitals') {
      const search = (config.params?.search as string | undefined) ?? '';
      return {
        status: 200,
        data: { hospitals: HOSPITALS.filter((hospital) => hospital.name.includes(search)) },
      };
    }
    if (config.url === '/auth/register/patient') {
      if (taken) return apiError(409, 'EMAIL_TAKEN', 'في حساب بهالإيميل بالمستشفى');
      return { status: 201, data: { accessToken: 'tok', expiresIn: 900, user: PATIENT } };
    }
    return { status: 200, data: {} };
  });
});

const signUpCall = () => fake.calls.find((call) => call.url === '/auth/register/patient');

async function chooseAmal() {
  const user = userEvent.setup();
  const router = renderApp('/register/patient');
  await user.click(await screen.findByRole('radio', { name: /مشفى الأمل/ }));
  await user.click(screen.getByRole('button', { name: 'التالي' }));
  return { user, router };
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/اسمك الكامل/), 'سارة الأحمد');
  await user.type(screen.getByLabelText(/رقم الموبايل/), '0991 234 567');
  await user.click(screen.getByRole('radio', { name: 'أنثى' }));
  await user.type(screen.getByLabelText(/تاريخ الميلاد/), '1990-05-17');
  await user.type(screen.getByLabelText(/إيميلك/), 'Sara@Mail.com');
  await user.type(screen.getByLabelText(/^كلمة السر/), 'Strong1234');
  await user.type(screen.getByLabelText(/تأكيد كلمة السر/), 'Strong1234');
}

describe('PatientRegisterPage', () => {
  it('is linked from the login page', async () => {
    const router = renderApp('/login');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: 'أنشئ حسابك' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/register/patient'));
  });

  it('asks for a hospital before moving on, and searches by name', async () => {
    renderApp('/register/patient');
    const user = userEvent.setup();
    const list = await screen.findByRole('radiogroup', { name: 'المستشفيات' });
    expect(await within(list).findAllByRole('radio')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByText('اختار مستشفى لتكمّل')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'ابحث عن مستشفى' }), 'دار');
    await waitFor(() => expect(within(list).getAllByRole('radio')).toHaveLength(1));
    expect(within(list).getByRole('radio', { name: /دار الشفاء/ })).toBeInTheDocument();
  });

  it('opens the account at the chosen hospital and lands on the patient area', async () => {
    const { user, router } = await chooseAmal();
    expect(await screen.findByText('رح تفتح حسابك بـ')).toBeInTheDocument();
    expect(screen.getByText('مشفى الأمل')).toBeInTheDocument();

    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/patient'));
    expect(JSON.parse(signUpCall()!.data as string)).toEqual({
      hospitalId: HOSPITALS[1].id,
      fullName: 'سارة الأحمد',
      phone: '0991 234 567',
      gender: 'FEMALE',
      dateOfBirth: '1990-05-17',
      email: 'sara@mail.com',
      password: 'Strong1234',
    });
    expect(useSessionStore.getState().user?.role).toBe('PATIENT');
  });

  it('checks the details and the password confirmation', async () => {
    const { user } = await chooseAmal();

    await user.click(await screen.findByRole('button', { name: 'إنشاء الحساب' }));
    expect((await screen.findAllByText('هالحقل مطلوب')).length).toBeGreaterThan(0);

    await fillDetails(user);
    await user.clear(screen.getByLabelText(/تأكيد كلمة السر/));
    await user.type(screen.getByLabelText(/تأكيد كلمة السر/), 'Other1234');
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(await screen.findByText('كلمتين السر مو متطابقين')).toBeInTheDocument();
    expect(signUpCall()).toBeUndefined();
  });

  it('explains an email that already has an account at that hospital', async () => {
    taken = true;
    const { user } = await chooseAmal();

    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('في حساب بهالإيميل بالمستشفى');
  });

  it('goes back to change the hospital, keeping the choice', async () => {
    const { user } = await chooseAmal();

    await user.click(await screen.findByRole('button', { name: 'تغيير' }));

    expect(await screen.findByRole('radio', { name: /مشفى الأمل/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
