import { createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteHandle } from '@/app/navigation';
import { AppShell } from '@/layouts/AppShell';
import { RootLayout } from '@/layouts/RootLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { HomePage } from '@/pages/HomePage';
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

// Role dashboards and route guards are added in tasks 1.19 and 1.20.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        id: 'app',
        element: <AppShell />,
        children: [
          {
            path: 'dashboard',
            element: <DashboardPage />,
            handle: { titleKey: 'nav.dashboard' } satisfies RouteHandle,
          },
        ],
      },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
