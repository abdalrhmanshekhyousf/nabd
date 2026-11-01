import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LOGO_MAX_BYTES } from '@nabd/shared';
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
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  role: 'ADMIN',
  language: 'AR',
  theme: 'SYSTEM',
  hospital: { id: 'h1', name: 'مستشفى الأمل', logoUrl: null },
};
const HOSPITAL = {
  id: 'h1',
  name: 'مستشفى الأمل',
  address: 'حلب',
  phone: '0991234567',
  email: null,
};

let logoUrl: string | null;

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
  logoUrl = null;
  useSessionStore.setState({ status: 'authenticated', user: ADMIN });
  // A small fake of the hospital API, keeping the logo between calls.
  fake.respond((config) => {
    if (config.url?.startsWith('/hospital/logo?')) return { status: 200, data: new Blob(['png']) };
    if (config.url === '/hospital/logo' && config.method === 'put')
      logoUrl = '/hospital/logo?v=new';
    if (config.url === '/hospital/logo' && config.method === 'delete') logoUrl = null;
    return { status: 200, data: { hospital: { ...HOSPITAL, logoUrl } } };
  });
});

const fileInput = () => screen.getByLabelText('اختار ملف', { selector: 'input' });
const uploads = () => fake.calls.filter((c) => c.url === '/hospital/logo' && c.method === 'put');

describe('LogoUploader', () => {
  it('refuses a file that is not a supported image before uploading', async () => {
    renderApp('/admin/settings');
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByText('شعار المستشفى');

    await user.upload(fileInput(), new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('نوع الملف مو مدعوم');
    expect(uploads()).toHaveLength(0);
  });

  it('refuses an image over 2 MB before uploading', async () => {
    renderApp('/admin/settings');
    const user = userEvent.setup();
    await screen.findByText('شعار المستشفى');

    const big = new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'big.png', { type: 'image/png' });
    await user.upload(fileInput(), big);

    expect(await screen.findByRole('alert')).toHaveTextContent('أكبر من 2 ميغا');
    expect(uploads()).toHaveLength(0);
  });

  it('uploads a logo and shows it in the sidebar', async () => {
    renderApp('/admin/settings');
    const user = userEvent.setup();
    await screen.findByText('شعار المستشفى');

    const logo = new File(['png'], 'logo.png', { type: 'image/png' });
    await user.upload(fileInput(), logo);

    await waitFor(() => expect(uploads()).toHaveLength(1));
    const sent = uploads()[0].data as FormData;
    expect(sent.get('logo')).toBe(logo);
    await waitFor(() =>
      expect(useSessionStore.getState().user?.hospital.logoUrl).toBe('/hospital/logo?v=new'),
    );
    const sidebar = screen.getAllByRole('complementary')[0];
    // The logo is decorative next to the hospital name (alt=""), so it has no img role.
    await waitFor(() =>
      expect(sidebar.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/),
    );
    expect(await screen.findByText('انرفع الشعار')).toBeInTheDocument();
  });

  it('removes the logo after confirming', async () => {
    logoUrl = '/hospital/logo?v=old';
    useSessionStore.setState({
      user: { ...ADMIN, hospital: { ...ADMIN.hospital, logoUrl: '/hospital/logo?v=old' } },
    });
    renderApp('/admin/settings');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'إزالة الشعار' }));
    const dialog = await screen.findByRole('dialog', { name: 'إزالة الشعار؟' });
    await user.click(within(dialog).getByRole('button', { name: 'إزالة الشعار' }));

    await waitFor(() => expect(useSessionStore.getState().user?.hospital.logoUrl).toBeNull());
    expect(fake.calls.some((c) => c.url === '/hospital/logo' && c.method === 'delete')).toBe(true);
  });
});
