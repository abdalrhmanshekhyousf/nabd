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

const ADMIN: SessionUser = {
  id: 'u1',
  email: 'sara@amal.org',
  fullName: 'سارة الأحمد',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};

const renderAt = renderApp;

const body = (index: number) => JSON.parse(fake.calls[index].data as string);

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  fake.calls.length = 0;
  queryClient.clear();
});

describe('RegisterPage', () => {
  beforeEach(() => {
    useSessionStore.setState({ status: 'anonymous', user: null });
  });

  it('is linked from the login page and back', async () => {
    const router = renderAt('/login');
    const u = userEvent.setup();

    await u.click(await screen.findByRole('link', { name: 'سجّل مستشفاك' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/register'));
    await u.click(await screen.findByRole('link', { name: 'سجّل دخولك' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('checks the hospital step before moving on', async () => {
    renderAt('/register');
    const u = userEvent.setup();

    await u.click(await screen.findByRole('button', { name: 'التالي' }));

    expect(await screen.findAllByText('هالحقل مطلوب')).toHaveLength(3);
    expect(screen.getByLabelText(/اسم المستشفى/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('creates the hospital, signs the admin in and opens the admin dashboard', async () => {
    fake.respond(() => ({
      status: 201,
      data: { accessToken: 'tok', expiresIn: 900, user: ADMIN },
    }));
    const router = renderAt('/register');
    const u = userEvent.setup();

    await u.type(await screen.findByLabelText(/اسم المستشفى/), 'مستشفى الأمل');
    await u.type(screen.getByLabelText(/العنوان/), 'حلب');
    await u.type(screen.getByLabelText(/رقم الهاتف/), '+963 21 123 4567');
    await u.click(screen.getByRole('button', { name: 'التالي' }));

    await u.type(await screen.findByLabelText(/اسمك الكامل/), 'سارة الأحمد');
    await u.type(screen.getByLabelText(/إيميلك/), 'Sara@Amal.Org');
    await u.type(screen.getByLabelText(/^كلمة السر/), 'Strong1234');
    await u.type(screen.getByLabelText(/تأكيد كلمة السر/), 'Strong9999');
    await u.click(screen.getByRole('button', { name: 'إنشاء المستشفى' }));
    expect(await screen.findByText('كلمتين السر مو متطابقين')).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);

    await u.clear(screen.getByLabelText(/تأكيد كلمة السر/));
    await u.type(screen.getByLabelText(/تأكيد كلمة السر/), 'Strong1234');
    await u.click(screen.getByRole('button', { name: 'إنشاء المستشفى' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(fake.calls[0].url).toBe('/auth/register');
    expect(body(0)).toEqual({
      hospital: { name: 'مستشفى الأمل', address: 'حلب', phone: '+963 21 123 4567', email: null },
      admin: { fullName: 'سارة الأحمد', email: 'sara@amal.org', password: 'Strong1234' },
    });
    expect(useSessionStore.getState().user?.role).toBe('ADMIN');
  });
});

describe('HospitalSettingsPage', () => {
  const hospital = {
    id: 'h1',
    name: 'مستشفى الأمل',
    address: 'حلب',
    phone: '021-1234567',
    email: null,
    logoUrl: null,
  };

  beforeEach(() => {
    useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  });

  it('loads the details, saves edits and renames the hospital in the sidebar', async () => {
    fake.respond((config) =>
      config.method === 'patch'
        ? { status: 200, data: { hospital: { ...hospital, ...JSON.parse(config.data as string) } } }
        : { status: 200, data: { hospital } },
    );
    renderAt('/admin/settings');
    const u = userEvent.setup();

    const name = await screen.findByDisplayValue('مستشفى الأمل');
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toBeDisabled();

    await u.clear(name);
    await u.type(name, 'مستشفى الأمل الجديد');
    expect(await screen.findByText('في تغييرات ما انحفظت')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() =>
      expect(useSessionStore.getState().user?.hospital.name).toBe('مستشفى الأمل الجديد'),
    );
    const patch = fake.calls.find((call) => call.method === 'patch')!;
    expect(JSON.parse(patch.data as string)).toEqual({
      name: 'مستشفى الأمل الجديد',
      address: 'حلب',
      phone: '021-1234567',
      email: null,
    });
    const sidebar = screen.getAllByRole('complementary')[0];
    expect(within(sidebar).getByText('مستشفى الأمل الجديد')).toBeInTheDocument();
  });

  it('cancel puts the saved details back', async () => {
    fake.respond(() => ({ status: 200, data: { hospital } }));
    renderAt('/admin/settings');
    const u = userEvent.setup();

    const address = await screen.findByDisplayValue('حلب');
    await u.type(address, ' الجديدة');
    await u.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(await screen.findByDisplayValue('حلب')).toBeInTheDocument();
  });

  it('is only for the admin', async () => {
    useSessionStore.setState({ status: 'authenticated', user: { ...ADMIN, role: 'DOCTOR' } });
    const router = renderAt('/admin/settings');
    await waitFor(() => expect(router.state.location.pathname).toBe('/doctor'));
  });
});
