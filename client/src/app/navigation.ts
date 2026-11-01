import { LayoutDashboard, Palette, type LucideIcon } from 'lucide-react';
import type { Translation } from '@/i18n/locales/ar';
import { ROLE_HOME } from './roles';
import type { Role } from './session';

export type NavKey = `nav.${keyof Translation['nav']}`;

export type NavItem = { to: string; labelKey: NavKey; icon: LucideIcon };

const DEV_ITEMS: NavItem[] = import.meta.env.DEV
  ? [{ to: '/dev/ui', labelKey: 'nav.uiGallery', icon: Palette }]
  : [];

/** Sidebar links of a role. Task 1.20 gives every role its full list. */
export function navItemsFor(role: Role): NavItem[] {
  return [{ to: ROLE_HOME[role], labelKey: 'nav.dashboard', icon: LayoutDashboard }, ...DEV_ITEMS];
}

/** Route `handle` used by the top bar to show the page title. */
export type RouteHandle = { titleKey?: NavKey };
