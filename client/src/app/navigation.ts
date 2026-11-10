import {
  Activity,
  Ambulance,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  ClipboardCheck,
  FileText,
  FlaskConical,
  FolderOpen,
  HeartPulse,
  History,
  LayoutDashboard,
  LayoutGrid,
  MessageSquareWarning,
  MessagesSquare,
  Network,
  Package,
  Palette,
  Pill,
  Receipt,
  ScanLine,
  Settings,
  ShoppingCart,
  Siren,
  SprayCan,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Translation } from '@/i18n/locales/ar';
import { ROLE_HOME } from './roles';
import type { Role } from './session';

export type NavKey = `nav.${keyof Translation['nav']}`;
export type NavGroupKey = `navGroups.${keyof Translation['navGroups']}`;

export type NavItem = {
  /** Path inside the role's area ('' is its dashboard), or an absolute path. */
  path: string;
  labelKey: NavKey;
  icon: LucideIcon;
  /** Plan phase that builds the page (shown on its placeholder until then). */
  phase?: 1 | 2 | 3 | 4;
};

export type NavGroup = { labelKey?: NavGroupKey; items: NavItem[] };

const dashboard: NavItem = { path: '', labelKey: 'nav.dashboard', icon: LayoutDashboard };
const leave: NavItem = { path: 'leave', labelKey: 'nav.leave', icon: CalendarOff, phase: 4 };
const inventory: NavItem = {
  path: 'inventory',
  labelKey: 'nav.inventory',
  icon: Package,
  phase: 3,
};
const bedMap: NavItem = { path: 'bed-map', labelKey: 'nav.bedMap', icon: LayoutGrid, phase: 3 };
const purchases: NavItem = {
  path: 'purchases',
  labelKey: 'nav.purchaseRequests',
  icon: ShoppingCart,
  phase: 4,
};

// Each role's sidebar, from the roles section of the project report.
export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  ADMIN: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.hospital',
      items: [
        { path: 'departments', labelKey: 'nav.departments', icon: Building2, phase: 1 },
        { path: 'rooms', labelKey: 'nav.roomsAndBeds', icon: BedDouble, phase: 1 },
        { path: 'operating-rooms', labelKey: 'nav.operatingRooms', icon: HeartPulse, phase: 1 },
        { path: 'or-live', labelKey: 'nav.orLive', icon: Activity, phase: 2 },
        bedMap,
        { path: 'staff', labelKey: 'nav.staff', icon: Users, phase: 1 },
        { path: 'assignments', labelKey: 'nav.assignments', icon: Network, phase: 1 },
        { path: 'settings', labelKey: 'nav.hospitalSettings', icon: Settings, phase: 1 },
      ],
    },
    {
      labelKey: 'navGroups.requests',
      items: [
        { path: 'approvals', labelKey: 'nav.approvals', icon: ClipboardCheck, phase: 4 },
        { path: 'complaints', labelKey: 'nav.complaints', icon: MessageSquareWarning, phase: 4 },
        { path: 'meetings', labelKey: 'nav.meetings', icon: CalendarClock, phase: 4 },
      ],
    },
    {
      labelKey: 'navGroups.reports',
      items: [
        { path: 'reports', labelKey: 'nav.reports', icon: FileText, phase: 3 },
        { path: 'profit', labelKey: 'nav.profit', icon: TrendingUp, phase: 4 },
        { path: 'activity', labelKey: 'nav.activityLog', icon: History, phase: 4 },
      ],
    },
  ],
  DOCTOR: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'patients', labelKey: 'nav.myPatients', icon: UserRound, phase: 2 },
        { path: 'calls', labelKey: 'nav.emergencyCalls', icon: Siren, phase: 2 },
        { path: 'or-bookings', labelKey: 'nav.orBookings', icon: CalendarPlus, phase: 2 },
        { path: 'or-live', labelKey: 'nav.orLive', icon: Activity, phase: 2 },
        bedMap,
        { path: 'schedule', labelKey: 'nav.schedule', icon: CalendarDays, phase: 3 },
        { path: 'consultations', labelKey: 'nav.consultations', icon: MessagesSquare, phase: 3 },
      ],
    },
    { labelKey: 'navGroups.requests', items: [leave] },
  ],
  NURSE: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'emergency', labelKey: 'nav.erQueue', icon: Siren, phase: 2 },
        { path: 'new-case', labelKey: 'nav.newCase', icon: UserPlus, phase: 2 },
        { path: 'operating-rooms', labelKey: 'nav.operatingRooms', icon: HeartPulse, phase: 2 },
        { path: 'beds', labelKey: 'nav.wardBeds', icon: BedDouble, phase: 3 },
        bedMap,
        { path: 'cleaning', labelKey: 'nav.cleaningRequests', icon: SprayCan, phase: 2 },
      ],
    },
    { labelKey: 'navGroups.requests', items: [leave] },
  ],
  PHARMACIST: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'prescriptions', labelKey: 'nav.prescriptions', icon: Pill, phase: 3 },
        inventory,
        { path: 'reports', labelKey: 'nav.pharmacyReports', icon: FileText, phase: 3 },
      ],
    },
    { labelKey: 'navGroups.requests', items: [purchases, leave] },
  ],
  LAB_TECHNICIAN: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'requests', labelKey: 'nav.labRequests', icon: FlaskConical, phase: 3 },
        inventory,
      ],
    },
    { labelKey: 'navGroups.requests', items: [purchases, leave] },
  ],
  RADIOLOGIST: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'requests', labelKey: 'nav.imagingRequests', icon: ScanLine, phase: 3 },
        inventory,
      ],
    },
    { labelKey: 'navGroups.requests', items: [purchases, leave] },
  ],
  CLEANER: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [{ path: 'tasks', labelKey: 'nav.cleaningTasks', icon: SprayCan, phase: 2 }],
    },
    { labelKey: 'navGroups.requests', items: [leave] },
  ],
  RECEPTIONIST: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'register', labelKey: 'nav.registerPatient', icon: UserPlus, phase: 4 },
        { path: 'appointments', labelKey: 'nav.appointments', icon: CalendarDays, phase: 4 },
        { path: 'emergency', labelKey: 'nav.emergencyRegistration', icon: Ambulance, phase: 4 },
      ],
    },
    { labelKey: 'navGroups.requests', items: [leave] },
  ],
  ACCOUNTANT: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.work',
      items: [
        { path: 'invoices', labelKey: 'nav.invoices', icon: Receipt, phase: 4 },
        { path: 'payments', labelKey: 'nav.payments', icon: Wallet, phase: 4 },
        { path: 'monthly-report', labelKey: 'nav.monthlyReport', icon: FileText, phase: 4 },
      ],
    },
    { labelKey: 'navGroups.requests', items: [leave] },
  ],
  PATIENT: [
    { items: [dashboard] },
    {
      labelKey: 'navGroups.care',
      items: [
        { path: 'file', labelKey: 'nav.medicalFile', icon: FolderOpen, phase: 3 },
        { path: 'appointments', labelKey: 'nav.myAppointments', icon: CalendarDays, phase: 3 },
        { path: 'medications', labelKey: 'nav.medications', icon: Pill, phase: 3 },
        { path: 'invoices', labelKey: 'nav.myInvoices', icon: Receipt, phase: 4 },
        { path: 'complaints', labelKey: 'nav.myComplaints', icon: MessageSquareWarning, phase: 4 },
      ],
    },
  ],
};

/** Full URL of a sidebar item (absolute paths, like dev tools, are kept as-is). */
export function navHref(role: Role, item: NavItem) {
  if (item.path.startsWith('/')) return item.path;
  return item.path ? `${ROLE_HOME[role]}/${item.path}` : ROLE_HOME[role];
}

/** Development tools appended to every sidebar while developing. */
export const DEV_GROUP: NavGroup | null = import.meta.env.DEV
  ? {
      labelKey: 'navGroups.dev',
      items: [{ path: '/dev/ui', labelKey: 'nav.uiGallery', icon: Palette }],
    }
  : null;

/** Route `handle` used by the top bar title and the placeholder pages. */
export type RouteHandle = { titleKey?: NavKey; phase?: NavItem['phase'] };
