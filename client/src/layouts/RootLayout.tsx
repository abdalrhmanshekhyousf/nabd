import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router';
import { IntroSplash } from '@/components/brand/IntroSplash';
import { Toaster } from '@/components/feedback/Toaster';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useIntroSplash } from '@/hooks/useIntroSplash';
import { EASE_CALM } from '@/lib/motion';

export function RootLayout() {
  useApplyTheme();
  const intro = useIntroSplash();
  const location = useLocation();
  // useOutlet (not <Outlet/>) so the leaving page keeps its content while it fades out.
  const outlet = useOutlet();

  return (
    <div className="min-h-full">
      {/* The app renders underneath, so it is ready when the intro opens up */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_CALM } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15, ease: 'easeIn' } }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      <Toaster />
      <AnimatePresence>
        {intro.visible && <IntroSplash key="intro" onFinish={intro.finish} />}
      </AnimatePresence>
    </div>
  );
}
