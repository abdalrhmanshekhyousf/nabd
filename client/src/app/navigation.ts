import { LayoutDashboard, Palette, type LucideIcon } from 'lucide-react';
import type { Translation } from '@/i18n/locales/ar';

export type NavKey = `nav.${keyof Translation['nav']}`;

export type NavItem = { to: string; labelKey: NavKey; icon: LucideIcon };

// Sidebar links. Task 1.20 replaces this with one list per role.
export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  ...(import.meta.env.DEV
    ? [{ to: '/dev/ui', labelKey: 'nav.uiGallery' as const, icon: Palette }]
    : []),
];

/** Route `handle` used by the top bar to show the page title. */
export type RouteHandle = { titleKey?: NavKey };
