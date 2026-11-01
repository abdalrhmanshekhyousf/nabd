import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useMatches, useOutlet } from 'react-router';
import { EASE_CALM } from '@/lib/motion';

type AnimatedOutletProps = {
  /**
   * What counts as "a new page":
   * - 'section': only when the child route changes (the root uses this, so moving
   *   between pages inside the app shell does not re-animate the whole shell)
   * - 'page': on every URL change (the shell's content area)
   */
  scope: 'section' | 'page';
  className?: string;
};

// Renders the child route with a calm fade/slide when it changes.
export function AnimatedOutlet({ scope, className }: AnimatedOutletProps) {
  const location = useLocation();
  const matches = useMatches();
  // useOutlet (not <Outlet/>) so the leaving page keeps its content while it fades out.
  const outlet = useOutlet();
  const key = scope === 'page' ? location.pathname : (matches[1]?.id ?? location.pathname);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className={className}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_CALM } }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.15, ease: 'easeIn' } }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
