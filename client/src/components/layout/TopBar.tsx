import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMatches } from 'react-router';
import type { SessionHospital, SessionUser } from '@/app/demoSession';
import type { RouteHandle } from '@/app/navigation';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AccountMenu } from './AccountMenu';
import { NotificationsMenu } from './NotificationsMenu';

type TopBarProps = {
  user: SessionUser;
  hospital: SessionHospital;
  menuOpen: boolean;
  onOpenMenu: () => void;
};

export function TopBar({ user, hospital, menuOpen, onOpenMenu }: TopBarProps) {
  const { t } = useTranslation();
  const titleKey = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.titleKey)
    .filter((key) => key !== undefined)
    .at(-1);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-6">
      <motion.button
        type="button"
        onClick={onOpenMenu}
        aria-label={t('shell.openMenu')}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
        whileTap={{ scale: 0.92 }}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </motion.button>

      {titleKey && (
        <motion.h1
          key={titleKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-lg"
        >
          {t(titleKey)}
        </motion.h1>
      )}

      <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
        {/* Compact toggles on phones so the bar fits at 320px */}
        <div className="flex items-center sm:hidden">
          <LanguageToggle compact />
          <ThemeToggle compact />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <NotificationsMenu />
        <AccountMenu user={user} hospital={hospital} />
      </div>
    </header>
  );
}
