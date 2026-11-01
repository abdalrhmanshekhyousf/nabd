import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { calmSpring } from '@/lib/motion';

type PopoverProps = {
  /** Accessible name of the trigger button (it usually shows only an icon). */
  label: string;
  /** Content of the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Panel content; receives `close` for items that should dismiss it. */
  children: (close: () => void) => ReactNode;
  panelClassName?: string;
};

// A button that opens a small floating panel aligned to its reading-end edge
// (top bar menus). Closes on outside click, Escape (focus returns to the button)
// and when an item calls `close`.
export function Popover({
  label,
  trigger,
  triggerClassName,
  children,
  panelClassName,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground sm:size-10',
          'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
          open && 'bg-surface-muted text-foreground',
          triggerClassName,
        )}
      >
        {trigger}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label={label}
            className={cn(
              // Phones: full width under the top bar; from sm up: anchored to the button.
              'fixed inset-x-3 top-16 z-40 origin-top rounded-xl border border-border bg-surface shadow-lifted',
              'sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-72 sm:ltr:origin-top-right sm:rtl:origin-top-left',
              panelClassName,
            )}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={calmSpring}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
