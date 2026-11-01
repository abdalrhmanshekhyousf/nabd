import { useEffect, useEffectEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** Called on Escape. */
  onEscape: () => void;
  /** Lock page scrolling while active (modals, drawers). */
  lockScroll?: boolean;
};

// While `active`: moves focus into the container (first element not marked
// data-skip-autofocus), keeps Tab cycling inside it, closes on Escape, and when it
// ends returns focus to whatever opened it.
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  { onEscape, lockScroll = true }: FocusTrapOptions,
) {
  const escape = useEffectEvent(() => onEscape());

  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const focusables = () => [
      ...(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];

    // Wait a frame so the animated container is mounted.
    const frame = requestAnimationFrame(() => {
      const all = focusables();
      (all.find((el) => el.dataset.skipAutofocus === undefined) ?? all[0])?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        escape();
        return;
      }
      if (event.key !== 'Tab') return;
      const all = focusables();
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      if (lockScroll) document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [active, containerRef, lockScroll]);
}
