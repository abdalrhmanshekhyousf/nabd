import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteHandle } from '@/app/navigation';
import { ROLE_HOME } from '@/app/roles';
import { ROLES } from '@/app/session';
import { HomeRedirect, PublicOnly, RequireAuth, RequireRole } from '@/components/auth/guards';
import { AppShell } from '@/layouts/AppShell';
import { RootLayout } from '@/layouts/RootLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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

// One protected area per role (/admin, /doctor, ...). Its pages are added in
// task 1.20; for now each area has its dashboard.
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
