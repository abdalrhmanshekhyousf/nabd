import { motion } from 'framer-motion';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { DEV_GROUP, NAV_BY_ROLE, navHref, type NavGroup } from '@/app/navigation';
import { ROLE_HOME } from '@/app/roles';
import { cn } from '@/lib/cn';
import { calmSpring } from '@/lib/motion';
import { useSessionStore } from '@/stores/sessionStore';

// The signed-in role's links, in titled groups; the soft highlight slides to the
// active page.
export function SidebarNav() {
  const { t } = useTranslation();
  const highlightId = useId();
  const role = useSessionStore((state) => state.user?.role);
  if (!role) return null;

  const groups: NavGroup[] = [...NAV_BY_ROLE[role], ...(DEV_GROUP ? [DEV_GROUP] : [])];

  return (
    <nav aria-label={t('shell.mainNav')} className="space-y-5">
      {groups.map((group, groupIndex) => {
        const headingId = `${highlightId}-group-${groupIndex}`;
        return (
          <div key={group.labelKey ?? 'main'}>
            {group.labelKey && (
              <p
                id={headingId}
                className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-muted/80 uppercase"
              >
                {t(group.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5" aria-labelledby={group.labelKey ? headingId : undefined}>
              {group.items.map((item) => {
                const to = navHref(role, item);
                const Icon = item.icon;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      // The dashboard link is active only on the dashboard itself.
                      end={to === ROLE_HOME[role]}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                          'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                          isActive
                            ? 'text-accent'
                            : 'text-muted hover:bg-surface-muted hover:text-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId={highlightId}
                              className="absolute inset-0 rounded-lg bg-accent-soft"
                              transition={calmSpring}
                            >
                              {/* Accent bar on the reading-start edge */}
                              <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-accent" />
                            </motion.span>
                          )}
                          <Icon
                            className="relative size-[18px] shrink-0 transition-transform group-hover:scale-110"
                            aria-hidden="true"
                          />
                          <span className="relative truncate">{t(item.labelKey)}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
