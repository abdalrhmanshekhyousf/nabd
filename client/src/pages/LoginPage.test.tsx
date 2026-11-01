import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SessionUser } from '@/app/session';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { renderApp } from '@/test/renderApp';
import { apiError, fakeApi } from '@/test/fakeApi';

const fake = fakeApi(api);

function user(role: SessionUser['role']): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role.toLowerCase()}@nabd.demo`,
    fullName: `Test ${role}`,
    role,
    language: 'AR',
    theme: 'SYSTEM',
    hospital: { id: 'h1', name: 'مستشفى نبض التجريبي', logoUrl: null },
  };
}

// The app as main.tsx renders it (router + query client).
const renderAt = renderApp;

const path = (router: ReturnType<typeof renderAt>) => router.state.location.pathname;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  useSessionStore.setState({ status: 'anonymous', user: null });
  fake.calls.length = 0;
});

describe('route protection', () => {
  it('sends signed-out visitors to the login page', async () => {
    const router = renderAt('/admin');
    await waitFor(() => expect(path(router)).toBe('/login'));
    expect(await screen.findByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  });

  it('sends "/" to the login page or to the dashboard of your role', async () => {
    const anonymous = renderAt('/');
    await waitFor(() => expect(path(anonymous)).toBe('/login'));

    useSessionStore.setState({ status: 'authenticated', user: user('NURSE') });
    const nurse = renderAt('/');
    await waitFor(() => expect(path(nurse)).toBe('/nurse'));
  });

  it("keeps a role out of another role's area and takes it home", async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('DOCTOR') });

    const router = renderAt('/admin');

    await waitFor(() => expect(path(router)).toBe('/doctor'));
    expect(await screen.findByText('هالصفحة مو من صلاحياتك، رجّعناك للوحتك')).toBeInTheDocument();
  });

  it('shows a loading screen while the session is being restored', () => {
    useSessionStore.setState({ status: 'loading', user: null });
    renderAt('/admin');
    expect(screen.getByRole('status', { name: 'جاري التحميل' })).toBeInTheDocument();
  });

  it('skips the login page when already signed in', async () => {
    useSessionStore.setState({ status: 'authenticated', user: user('PATIENT') });
    const router = renderAt('/login');
    await waitFor(() => expect(path(router)).toBe('/patient'));
  });
});

describe('LoginPage', () => {
  async function fillAndSubmit(email: string, password: string) {
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('الإيميل'), email);
    await u.type(screen.getByLabelText('كلمة السر'), password);
    await u.click(screen.getByRole('button', { name: 'دخول' }));
    return u;
  }

  it('checks the fields before calling the server', async () => {
    renderAt('/login');
    const u = userEvent.setup();

    await u.click(await screen.findByRole('button', { name: 'دخول' }));
    expect(await screen.findByText('اكتب إيميلك')).toBeInTheDocument();
    expect(screen.getByText('اكتب كلمة السر')).toBeInTheDocument();

    await u.type(screen.getByLabelText('الإيميل'), 'not-an-email');
    await u.click(screen.getByRole('button', { name: 'دخول' }));
    expect(await screen.findByText('الإيميل مو مكتوب صح')).toBeInTheDocument();
    expect(fake.calls).toHaveLength(0);
  });

  it('signs in and opens the dashboard of the role', async () => {
    fake.respond(() => ({
      status: 200,
      data: { accessToken: 'tok', expiresIn: 900, user: user('DOCTOR') },
    }));
    const router = renderAt('/login');

    await fillAndSubmit('doctor@nabd.demo', 'Admin@12345');

    await waitFor(() => expect(path(router)).toBe('/doctor'));
    expect(JSON.parse(fake.calls[0].data as string)).toEqual({
      email: 'doctor@nabd.demo',
      password: 'Admin@12345',
    });
    expect(useSessionStore.getState().user?.role).toBe('DOCTOR');
  });

  it('returns to the page you wanted, if your role may see it', async () => {
    fake.respond(() => ({
      status: 200,
      data: { accessToken: 'tok', expiresIn: 900, user: user('ADMIN') },
    }));
    const router = renderAt('/login', { from: '/admin' });

    await fillAndSubmit('admin@nabd.demo', 'Admin@12345');

    await waitFor(() => expect(path(router)).toBe('/admin'));
  });

  it('shows the server message when the password is wrong', async () => {
    fake.respond(() => apiError(401, 'INVALID_CREDENTIALS', 'الإيميل أو كلمة السر غير صحيحة'));
    renderAt('/login');

    await fillAndSubmit('admin@nabd.demo', 'nope');

    expect(await screen.findByRole('alert')).toHaveTextContent('الإيميل أو كلمة السر غير صحيحة');
    expect(useSessionStore.getState().status).toBe('anonymous');
  });

  it('asks which hospital when the account exists in several', async () => {
    fake.respond((config) => {
      const body = JSON.parse(config.data as string);
      if (!body.hospitalId) {
        return {
          status: 409,
          data: {
            error: {
              code: 'HOSPITAL_REQUIRED',
              message: 'm',
              details: {
                hospitals: [
                  { id: 'h1', name: 'مستشفى الأمل' },
                  { id: 'h2', name: 'مستشفى الشفاء' },
                ],
              },
            },
          },
        };
      }
      return { status: 200, data: { accessToken: 'tok', expiresIn: 900, user: user('PATIENT') } };
    });
    const router = renderAt('/login');

    const u = await fillAndSubmit('patient@nabd.demo', 'Admin@12345');
    const list = await screen.findByRole('region', { name: 'اختار المستشفى' });
    await u.click(within(list).getByRole('button', { name: /مستشفى الشفاء/ }));

    await waitFor(() => expect(path(router)).toBe('/patient'));
    expect(JSON.parse(fake.calls.at(-1)!.data as string).hospitalId).toBe('h2');
  });

  it('shows and hides the password', async () => {
    renderAt('/login');
    const u = userEvent.setup();
    const password = await screen.findByLabelText('كلمة السر');

    expect(password).toHaveAttribute('type', 'password');
    await u.click(screen.getByRole('button', { name: 'إظهار كلمة السر' }));
    expect(password).toHaveAttribute('type', 'text');
    await u.click(screen.getByRole('button', { name: 'إخفاء كلمة السر' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
