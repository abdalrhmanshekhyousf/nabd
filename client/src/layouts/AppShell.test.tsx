import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import { initials } from '@/lib/initials';
import { useSessionStore } from '@/stores/sessionStore';
import { renderApp } from '@/test/renderApp';
import { useThemeStore } from '@/stores/themeStore';

// The app as main.tsx renders it (router + query client).
const renderAt = renderApp;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: 'u1',
      email: 'admin@nabd.demo',
      fullName: 'مدير المستشفى',
      role: 'ADMIN',
      language: 'AR',
      theme: 'SYSTEM',
      hospital: { id: 'h1', name: 'مستشفى نبض التجريبي', logoUrl: null },
    },
  });
  useThemeStore.setState({ theme: 'system' });
});

describe('AppShell', () => {
  it('shows the hospital, navigation, page title and "Powered by Nabd"', async () => {
    renderAt('/admin');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'لوحة التحكم' }),
    ).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'التنقل الرئيسي' })[0];
    expect(within(nav).getByRole('link', { name: 'لوحة التحكم' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByText('مستشفى نبض التجريبي').length).toBeGreaterThan(0);
    expect(screen.getByText('Powered by Nabd')).toBeInTheDocument();
  });

  it('opens the navigation drawer, traps focus in it and closes on Escape', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    const openButton = await screen.findByRole('button', { name: 'فتح القائمة' });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(openButton);

    const drawer = screen.getByRole('dialog', { name: 'التنقل الرئيسي' });
    await waitFor(() =>
      expect(within(drawer).getByRole('link', { name: 'لوحة التحكم' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(openButton).toHaveFocus();
  });

  it('closes the drawer when any link in it is tapped, even the current page', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    await user.click(await screen.findByRole('button', { name: 'فتح القائمة' }));
    const drawer = screen.getByRole('dialog', { name: 'التنقل الرئيسي' });
    await user.click(within(drawer).getByRole('link', { name: 'لوحة التحكم' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'التنقل الرئيسي' })).not.toBeInTheDocument(),
    );
  });

  it('shows the empty notifications panel and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    const bell = await screen.findByRole('button', { name: 'الإشعارات' });
    await user.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('ما في إشعارات لسا')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('ما في إشعارات لسا')).not.toBeInTheDocument());
    expect(bell).toHaveFocus();
  });

  it('closes a menu when clicking outside it', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    await user.click(await screen.findByRole('button', { name: 'الإشعارات' }));
    await user.click(screen.getByRole('heading', { level: 2 }));

    await waitFor(() => expect(screen.queryByText('ما في إشعارات لسا')).not.toBeInTheDocument());
  });

  it('shows the user, role and hospital in the account menu', async () => {
    const user = userEvent.setup();
    const router = renderAt('/admin');

    await user.click(await screen.findByRole('button', { name: 'الحساب: مدير المستشفى' }));
    const panel = screen.getByRole('dialog', { name: 'الحساب: مدير المستشفى' });
    expect(within(panel).getByText('مدير المستشفى')).toBeInTheDocument();
    expect(within(panel).getByText(/المدير · مستشفى نبض التجريبي/)).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'تسجيل الخروج' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('cycles the theme with the compact phone button', async () => {
    const user = userEvent.setup();
    renderAt('/admin');

    const compact = await screen.findByRole('button', { name: 'وضع العرض: حسب الجهاز' });
    await user.click(compact);
    expect(useThemeStore.getState().theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'وضع العرض: فاتح' }));
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});

describe('initials', () => {
  it('takes the first letters of the first and last words', () => {
    expect(initials('Omar Haddad')).toBe('OH');
    expect(initials('مستشفى نبض التجريبي')).toBe('ما');
    expect(initials('سامر')).toBe('س');
    expect(initials('  ')).toBe('');
  });
});
