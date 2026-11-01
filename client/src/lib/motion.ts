import type { Transition } from 'framer-motion';
import { flushSync } from 'react-dom';

/** Same curve as --ease-calm in index.css: responsive start, soft landing. */
export const EASE_CALM = [0.22, 1, 0.36, 1] as const;

export const calm: Transition = { duration: 0.25, ease: EASE_CALM };
export const calmSpring: Transition = { type: 'spring', stiffness: 380, damping: 32 };

/** Gentle entrance used by page sections; pass an index to stagger. */
export function enter(index = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...calm, duration: 0.35, delay: index * 0.06 },
  } as const;
}

type ViewTransitionKind = 'theme' | 'language';

/**
 * Runs a DOM-changing update inside a View Transition so the change animates
 * (see ::view-transition rules in index.css). `origin` is where the theme reveal
 * starts. Falls back to a plain update when unsupported or with reduced motion.
 */
export function withViewTransition(
  kind: ViewTransitionKind,
  update: () => void,
  origin?: { x: number; y: number },
) {
  const supported = 'startViewTransition' in document;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!supported || reduced) {
    update();
    return;
  }

  const root = document.documentElement;
  if (origin) {
    // Radius that reaches the farthest corner from the origin.
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty('--vt-x', `${origin.x}px`);
    root.style.setProperty('--vt-y', `${origin.y}px`);
    root.style.setProperty('--vt-r', `${radius}px`);
  }
  root.dataset.vt = kind;

  const transition = document.startViewTransition(() => flushSync(update));
  void transition.finished.finally(() => {
    delete root.dataset.vt;
  });
}
