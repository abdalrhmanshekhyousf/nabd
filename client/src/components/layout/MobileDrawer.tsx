import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { SessionHospital } from '@/app/demoSession';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { currentLanguage, directionOf } from '@/i18n';
import { calmSpring } from '@/lib/motion';
import { SidebarContent } from './SidebarContent';

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  hospital: SessionHospital;
};

// The sidebar on phones and tablets: slides in from the reading-start edge
// (right in Arabic, left in English) over a dimmed page.
export function MobileDrawer({ open, onClose, hospital }: MobileDrawerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, { onEscape: onClose });
  const offscreen = directionOf(currentLanguage()) === 'rtl' ? '100%' : '-100%';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panelRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label={t('shell.mainNav')}
            // Any link tap closes the drawer, even one to the page already open.
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a[href]')) onClose();
            }}
            className="absolute inset-y-0 start-0 w-[min(18rem,85vw)] border-e border-border bg-surface shadow-lifted"
            initial={{ x: offscreen }}
            animate={{ x: 0 }}
            exit={{ x: offscreen, transition: { duration: 0.2, ease: 'easeIn' } }}
            transition={calmSpring}
          >
            <SidebarContent
              hospital={hospital}
              headerAction={
                <button
                  type="button"
                  data-skip-autofocus
                  onClick={onClose}
                  aria-label={t('shell.closeMenu')}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              }
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
