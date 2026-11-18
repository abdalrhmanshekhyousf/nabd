import type { ReactElement } from 'react';
import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';
import { NAV_BY_ROLE, type RouteHandle } from '@/app/navigation';
import { ROLE_HOME } from '@/app/roles';
import { ROLES, type Role } from '@/app/session';
import { HomeRedirect, PublicOnly, RequireAuth, RequireRole } from '@/components/auth/guards';
import { AppShell } from '@/layouts/AppShell';
import { RootLayout } from '@/layouts/RootLayout';
import { lazyPage } from './lazyPage';

// Every page is loaded when first opened (task 5.3).
const DepartmentsPage = lazyPage(() => import('@/pages/admin/DepartmentsPage'), 'DepartmentsPage');
const HospitalSettingsPage = lazyPage(
  () => import('@/pages/admin/HospitalSettingsPage'),
  'HospitalSettingsPage',
);
const OperatingRoomsPage = lazyPage(
  () => import('@/pages/admin/OperatingRoomsPage'),
  'OperatingRoomsPage',
);
const RoomsPage = lazyPage(() => import('@/pages/admin/RoomsPage'), 'RoomsPage');
const StaffPage = lazyPage(() => import('@/pages/admin/StaffPage'), 'StaffPage');
const AssignmentsPage = lazyPage(() => import('@/pages/admin/AssignmentsPage'), 'AssignmentsPage');
const ComingSoonPage = lazyPage(() => import('@/pages/ComingSoonPage'), 'ComingSoonPage');
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage');
const LoginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage');
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const DoctorCallsPage = lazyPage(() => import('@/pages/doctor/DoctorCallsPage'), 'DoctorCallsPage');
const DoctorPatientsPage = lazyPage(
  () => import('@/pages/doctor/DoctorPatientsPage'),
  'DoctorPatientsPage',
);
const OrBookingsPage = lazyPage(() => import('@/pages/doctor/OrBookingsPage'), 'OrBookingsPage');
const OrLivePage = lazyPage(() => import('@/pages/OrLivePage'), 'OrLivePage');
const BedMapPage = lazyPage(() => import('@/pages/BedMapPage'), 'BedMapPage');
const InventoryPage = lazyPage(() => import('@/pages/InventoryPage'), 'InventoryPage');
const LabBoardPage = lazyPage(() => import('@/pages/lab/LabBoardPage'), 'LabBoardPage');
const PharmacyPage = lazyPage(() => import('@/pages/pharmacy/PharmacyPage'), 'PharmacyPage');
const PharmacyReportsPage = lazyPage(
  () => import('@/pages/pharmacy/PharmacyReportsPage'),
  'PharmacyReportsPage',
);
const ReportsPage = lazyPage(() => import('@/pages/admin/ReportsPage'), 'ReportsPage');
const RadiologyBoardPage = lazyPage(
  () => import('@/pages/radiology/RadiologyBoardPage'),
  'RadiologyBoardPage',
);
const NurseCleaningPage = lazyPage(
  () => import('@/pages/nurse/NurseCleaningPage'),
  'NurseCleaningPage',
);
const WardPage = lazyPage(() => import('@/pages/nurse/WardPage'), 'WardPage');
const OrBoardPage = lazyPage(() => import('@/pages/nurse/OrBoardPage'), 'OrBoardPage');
const CleanerTasksPage = lazyPage(
  () => import('@/pages/cleaner/CleanerTasksPage'),
  'CleanerTasksPage',
);
const PatientFilePage = lazyPage(() => import('@/pages/doctor/PatientFilePage'), 'PatientFilePage');
const AppointmentsPage = lazyPage(
  () => import('@/pages/patient/AppointmentsPage'),
  'AppointmentsPage',
);
const MedicalFilePage = lazyPage(
  () => import('@/pages/patient/MedicalFilePage'),
  'MedicalFilePage',
);
const RegisterPatientPage = lazyPage(
  () => import('@/pages/reception/RegisterPatientPage'),
  'RegisterPatientPage',
);
const DeskAppointmentsPage = lazyPage(
  () => import('@/pages/reception/DeskAppointmentsPage'),
  'DeskAppointmentsPage',
);
const ReceptionEmergencyPage = lazyPage(
  () => import('@/pages/reception/ReceptionEmergencyPage'),
  'ReceptionEmergencyPage',
);
const DepartmentRequestsPage = lazyPage(
  () => import('@/pages/requests/DepartmentRequestsPage'),
  'DepartmentRequestsPage',
);
const ApprovalsPage = lazyPage(() => import('@/pages/admin/ApprovalsPage'), 'ApprovalsPage');
const AdminComplaintsPage = lazyPage(
  () => import('@/pages/admin/ComplaintsPage'),
  'AdminComplaintsPage',
);
const MeetingsPage = lazyPage(() => import('@/pages/admin/MeetingsPage'), 'MeetingsPage');
const DoctorMeetingsPage = lazyPage(
  () => import('@/pages/doctor/MeetingsPage'),
  'DoctorMeetingsPage',
);
const PricesPage = lazyPage(() => import('@/pages/accounting/PricesPage'), 'PricesPage');
const InvoicesPage = lazyPage(() => import('@/pages/accounting/InvoicesPage'), 'InvoicesPage');
const PaymentsPage = lazyPage(() => import('@/pages/accounting/PaymentsPage'), 'PaymentsPage');
const MyInvoicesPage = lazyPage(() => import('@/pages/patient/InvoicesPage'), 'MyInvoicesPage');
const MonthlyReportPage = lazyPage(
  () => import('@/pages/accounting/MonthlyReportPage'),
  'MonthlyReportPage',
);
const ProfitPage = lazyPage(() => import('@/pages/admin/ProfitPage'), 'ProfitPage');
const ActivityPage = lazyPage(() => import('@/pages/admin/ActivityPage'), 'ActivityPage');
const ComplaintsPage = lazyPage(() => import('@/pages/patient/ComplaintsPage'), 'ComplaintsPage');
const LeavePage = lazyPage(() => import('@/pages/requests/LeavePage'), 'LeavePage');
const MedicationsPage = lazyPage(
  () => import('@/pages/patient/MedicationsPage'),
  'MedicationsPage',
);
const ConsultationsPage = lazyPage(
  () => import('@/pages/doctor/ConsultationsPage'),
  'ConsultationsPage',
);
const SchedulePage = lazyPage(() => import('@/pages/doctor/SchedulePage'), 'SchedulePage');
const ConsultationFilePage = lazyPage(
  () => import('@/pages/doctor/ConsultationFilePage'),
  'ConsultationFilePage',
);
const ErQueuePage = lazyPage(() => import('@/pages/nurse/ErQueuePage'), 'ErQueuePage');
const NewCasePage = lazyPage(() => import('@/pages/nurse/NewCasePage'), 'NewCasePage');
const TriagePage = lazyPage(() => import('@/pages/nurse/TriagePage'), 'TriagePage');
const PatientRegisterPage = lazyPage(
  () => import('@/pages/PatientRegisterPage'),
  'PatientRegisterPage',
);
const RegisterPage = lazyPage(() => import('@/pages/RegisterPage'), 'RegisterPage');

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
  'ADMIN:bed-map': <BedMapPage />,
  'DOCTOR:bed-map': <BedMapPage />,
  'NURSE:bed-map': <BedMapPage />,
  'ADMIN:staff': <StaffPage />,
  'ADMIN:assignments': <AssignmentsPage />,
  'ADMIN:settings': <HospitalSettingsPage />,
  'DOCTOR:patients': <DoctorPatientsPage />,
  'DOCTOR:calls': <DoctorCallsPage />,
  'DOCTOR:or-bookings': <OrBookingsPage />,
  'DOCTOR:or-live': <OrLivePage />,
  'DOCTOR:consultations': <ConsultationsPage />,
  'DOCTOR:schedule': <SchedulePage />,
  'NURSE:emergency': <ErQueuePage />,
  'NURSE:operating-rooms': <OrBoardPage />,
  'NURSE:cleaning': <NurseCleaningPage />,
  'NURSE:beds': <WardPage />,
  'CLEANER:tasks': <CleanerTasksPage />,
  'PHARMACIST:inventory': <InventoryPage />,
  'PHARMACIST:prescriptions': <PharmacyPage />,
  'PHARMACIST:reports': <PharmacyReportsPage />,
  'ADMIN:reports': <ReportsPage />,
  'LAB_TECHNICIAN:inventory': <InventoryPage />,
  'LAB_TECHNICIAN:requests': <LabBoardPage />,
  'RADIOLOGIST:requests': <RadiologyBoardPage />,
  'RADIOLOGIST:inventory': <InventoryPage />,
  'NURSE:new-case': <NewCasePage />,
  'PATIENT:appointments': <AppointmentsPage />,
  'PATIENT:file': <MedicalFilePage />,
  'RECEPTIONIST:register': <RegisterPatientPage />,
  'RECEPTIONIST:appointments': <DeskAppointmentsPage />,
  'RECEPTIONIST:emergency': <ReceptionEmergencyPage />,
  'ADMIN:approvals': <ApprovalsPage />,
  'PATIENT:complaints': <ComplaintsPage />,
  'ADMIN:complaints': <AdminComplaintsPage />,
  'ADMIN:meetings': <MeetingsPage />,
  'DOCTOR:meetings': <DoctorMeetingsPage />,
  'ACCOUNTANT:prices': <PricesPage />,
  'ACCOUNTANT:invoices': <InvoicesPage />,
  'ACCOUNTANT:payments': <PaymentsPage />,
  'PATIENT:invoices': <MyInvoicesPage />,
  'ACCOUNTANT:monthly-report': <MonthlyReportPage />,
  'ADMIN:profit': <ProfitPage />,
  'ADMIN:activity': <ActivityPage />,
  // A department's purchase and repair requests, through its head (task 4.6).
  ...Object.fromEntries(
    (['DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGIST'] as const).map((role) => [
      `${role}:purchases`,
      <DepartmentRequestsPage />,
    ]),
  ),
  // Every staff member's leave requests (task 4.5).
  ...Object.fromEntries(
    (
      [
        'DOCTOR',
        'NURSE',
        'PHARMACIST',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'CLEANER',
        'RECEPTIONIST',
        'ACCOUNTANT',
      ] as const
    ).map((role) => [`${role}:leave`, <LeavePage />]),
  ),
  'PATIENT:medications': <MedicationsPage />,
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
    {
      path: 'consultations/:consultationId',
      element: <ConsultationFilePage />,
      handle: { titleKey: 'nav.patientFile', phase: 3 } satisfies RouteHandle,
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
