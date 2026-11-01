import { render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INTRO_SEEN_KEY } from '@/hooks/useIntroSplash';
import i18n from '@/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import { NAV_BY_ROLE, navHref } from './navigation';
import { canVisit, ROLE_HOME } from './roles';
import { routes } from './router';
import { ROLES, type Role } from './session';

function signInAs(role: Role) {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: `u-${role}`,
      email: 'x@nabd.demo',
      fullName: 'Test',
      role,
      language: 'AR',
      theme: 'SYSTEM',
      hospital: { id: 'h1', name: 'مستشفى نبض التجريبي', logoUrl: null },
    },
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const itemsOf = (role: Role) => NAV_BY_ROLE[role].flatMap((group) => group.items);

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
});

describe('navigation data', () => {
  it.each(ROLES)('%s: starts with the dashboard and stays inside its own area', (role) => {
    const items = itemsOf(role);
    expect(items[0].labelKey).toBe('nav.dashboard');
    const hrefs = items.map((item) => navHref(role, item));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(canVisit(href, role)).toBe(true);
  });

  it('gives every role its own area', () => {
    expect(new Set(Object.values(ROLE_HOME)).size).toBe(ROLES.length);
  });
});

describe('sidebar per role', () => {
  it.each(ROLES)('%s sees exactly its own links', async (role) => {
    signInAs(role);
    renderAt(ROLE_HOME[role]);

    const nav = (await screen.findAllByRole('navigation', { name: 'التنقل الرئيسي' }))[0];
    const links = within(nav).getAllByRole('link');
    const expected = itemsOf(role).map((item) => i18n.t(item.labelKey));

    // Plus the component gallery link that only exists in development.
    expect(links.map((link) => link.textContent)).toEqual([...expected, 'مكتبة المكوّنات']);
    for (const group of NAV_BY_ROLE[role]) {
      if (group.labelKey) expect(within(nav).getByText(i18n.t(group.labelKey))).toBeInTheDocument();
    }
  });
});

describe('placeholder pages', () => {
  it.each(ROLES)('%s: every link opens a page with its title and plan phase', async (role) => {
    signInAs(role);
    for (const item of itemsOf(role).filter((entry) => entry.path)) {
      const router = renderAt(navHref(role, item));
      await waitFor(() => expect(router.state.location.pathname).toBe(navHref(role, item)));

      const title = i18n.t(item.labelKey);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText(`المرحلة ${item.phase}`)).toBeInTheDocument();
      expect(screen.getByText('هالصفحة قيد البناء')).toBeInTheDocument();
      router.dispose();
      document.body.innerHTML = '';
    }
  });

  it("refuses another role's page", async () => {
    signInAs('PATIENT');
    const router = renderAt('/admin/staff');
    await waitFor(() => expect(router.state.location.pathname).toBe('/patient'));
  });
});
