import type { ReactElement } from 'react';
import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';
import { NAV_BY_ROLE, type RouteHandle } from '@/app/navigation';
import { ROLE_HOME } from '@/app/roles';
import { ROLES, type Role } from '@/app/session';
import { HomeRedirect, PublicOnly, RequireAuth, RequireRole } from '@/components/auth/guards';
import { AppShell } from '@/layouts/AppShell';
import { RootLayout } from '@/layouts/RootLayout';
import { DepartmentsPage } from '@/pages/admin/DepartmentsPage';
import { HospitalSettingsPage } from '@/pages/admin/HospitalSettingsPage';
import { OperatingRoomsPage } from '@/pages/admin/OperatingRoomsPage';
import { RoomsPage } from '@/pages/admin/RoomsPage';
import { StaffPage } from '@/pages/admin/StaffPage';
import { AssignmentsPage } from '@/pages/admin/AssignmentsPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegisterPage } from '@/pages/RegisterPage';

// Development-only pages; the dynamic import keeps them out of production bundles.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/ui',
        lazy: async () => ({
          Component: (await import('@/pages/dev/UiGalleryPage')).UiGalleryPage,
        }),
      },
    ]
  : [];

// Sidebar pages that are built, by "ROLE:path". Every other link shows the
// placeholder until its task lands.
export const BUILT_PAGES: Partial<Record<`${Role}:${string}`, ReactElement>> = {
  'ADMIN:departments': <DepartmentsPage />,
  'ADMIN:rooms': <RoomsPage />,
  'ADMIN:operating-rooms': <OperatingRoomsPage />,
  'ADMIN:staff': <StaffPage />,
  'ADMIN:assignments': <AssignmentsPage />,
  'ADMIN:settings': <HospitalSettingsPage />,
};

// One protected area per role (/admin, /doctor, ...): its dashboard plus a page
// for every sidebar link. Pages not built yet show a placeholder (task 1.20).
const roleAreas: RouteObject[] = ROLES.map((role) => ({
  path: ROLE_HOME[role].slice(1),
  element: (
    <RequireRole role={role}>
      <Outlet />
    </RequireRole>
  ),
  children: [
    {
      index: true,
      element: <DashboardPage />,
      handle: { titleKey: 'nav.dashboard' } satisfies RouteHandle,
    },
    ...NAV_BY_ROLE[role]
      .flatMap((group) => group.items)
      .filter((item) => item.path !== '')
      .map((item) => ({
        path: item.path,
        element: BUILT_PAGES[`${role}:${item.path}`] ?? <ComingSoonPage />,
        handle: { titleKey: item.labelKey, phase: item.phase } satisfies RouteHandle,
      })),
  ],
}));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        path: 'login',
        element: (
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        ),
      },
      {
        path: 'register',
        element: (
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        ),
      },
      {
        id: 'app',
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          // Old link from before role areas existed.
          { path: 'dashboard', element: <HomeRedirect /> },
          ...roleAreas,
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
