import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useOpenCloseSound } from '@/hooks/useOpenCloseSound';
import { cn } from '@/lib/cn';
import { calmSpring } from '@/lib/motion';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' } as const;

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, shown at the bottom. */
  footer?: ReactNode;
  size?: keyof typeof SIZES;
};

// Centered dialog from sm up, bottom sheet on phones. Escape and the backdrop
// close it, focus stays inside while open and returns to the opener after.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, { onEscape: onClose });
  useOpenCloseSound(open);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              'relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-lifted sm:rounded-2xl',
              SIZES[size],
            )}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            // Closing is quicker than opening so the app feels responsive.
            exit={{
              opacity: 0,
              y: 40,
              scale: 0.98,
              transition: { duration: 0.18, ease: 'easeIn' },
            }}
            transition={calmSpring}
          >
            {/* Grab handle hint on phones */}
            <div
              className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden"
              aria-hidden="true"
            />
            <header className="flex items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 space-y-1">
                <h2 id={titleId} className="text-lg font-semibold text-foreground">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-skip-autofocus
                onClick={onClose}
                aria-label={t('common.close')}
                className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>
            {children && (
              <div className="overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
            )}
            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-5">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
