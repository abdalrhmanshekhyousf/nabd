import { AnimatePresence } from 'framer-motion';
import { IntroSplash } from '@/components/brand/IntroSplash';
import { Toaster } from '@/components/feedback/Toaster';
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useIntroSplash } from '@/hooks/useIntroSplash';
import { useRealtime } from '@/hooks/useRealtime';

export function RootLayout() {
  useApplyTheme();
  const intro = useIntroSplash();
  // Live notifications on every page while someone is signed in (task 2.3).
  useRealtime();

  return (
    <div className="min-h-full">
      {/* The app renders underneath, so it is ready when the intro opens up */}
      <AnimatedOutlet scope="section" />
      <Toaster />
      <AnimatePresence>
        {intro.visible && <IntroSplash key="intro" onFinish={intro.finish} />}
      </AnimatePresence>
    </div>
  );
}
