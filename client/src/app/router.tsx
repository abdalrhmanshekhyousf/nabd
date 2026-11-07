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
import { DoctorCallsPage } from '@/pages/doctor/DoctorCallsPage';
import { DoctorPatientsPage } from '@/pages/doctor/DoctorPatientsPage';
import { OrBookingsPage } from '@/pages/doctor/OrBookingsPage';
import { OrLivePage } from '@/pages/OrLivePage';
import { InventoryPage } from '@/pages/InventoryPage';
import { LabBoardPage } from '@/pages/lab/LabBoardPage';
import { RadiologyBoardPage } from '@/pages/radiology/RadiologyBoardPage';
import { NurseCleaningPage } from '@/pages/nurse/NurseCleaningPage';
import { OrBoardPage } from '@/pages/nurse/OrBoardPage';
import { CleanerTasksPage } from '@/pages/cleaner/CleanerTasksPage';
import { PatientFilePage } from '@/pages/doctor/PatientFilePage';
import { ErQueuePage } from '@/pages/nurse/ErQueuePage';
import { NewCasePage } from '@/pages/nurse/NewCasePage';
import { TriagePage } from '@/pages/nurse/TriagePage';
import { PatientRegisterPage } from '@/pages/PatientRegisterPage';
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
  'ADMIN:or-live': <OrLivePage />,
  'ADMIN:staff': <StaffPage />,
  'ADMIN:assignments': <AssignmentsPage />,
  'ADMIN:settings': <HospitalSettingsPage />,
  'DOCTOR:patients': <DoctorPatientsPage />,
  'DOCTOR:calls': <DoctorCallsPage />,
  'DOCTOR:or-bookings': <OrBookingsPage />,
  'DOCTOR:or-live': <OrLivePage />,
  'NURSE:emergency': <ErQueuePage />,
  'NURSE:operating-rooms': <OrBoardPage />,
  'NURSE:cleaning': <NurseCleaningPage />,
  'CLEANER:tasks': <CleanerTasksPage />,
  'PHARMACIST:inventory': <InventoryPage />,
  'LAB_TECHNICIAN:inventory': <InventoryPage />,
  'LAB_TECHNICIAN:requests': <LabBoardPage />,
  'RADIOLOGIST:requests': <RadiologyBoardPage />,
  'RADIOLOGIST:inventory': <InventoryPage />,
  'NURSE:new-case': <NewCasePage />,
};

// Pages opened from inside a section (not sidebar links), by role.
const DETAIL_ROUTES: Partial<Record<Role, RouteObject[]>> = {
  NURSE: [
    {
      path: 'triage/:visitId',
      element: <TriagePage />,
      handle: { titleKey: 'nav.triage', phase: 2 } satisfies RouteHandle,
    },
  ],
  DOCTOR: [
    {
      path: 'patients/:patientId',
      element: <PatientFilePage />,
      handle: { titleKey: 'nav.patientFile', phase: 2 } satisfies RouteHandle,
    },
  ],
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
    ...(DETAIL_ROUTES[role] ?? []),
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
        path: 'register/patient',
        element: (
          <PublicOnly>
            <PatientRegisterPage />
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
