import { AnimatePresence } from 'framer-motion';
import { Outlet } from 'react-router';
import { IntroSplash } from '@/components/brand/IntroSplash';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { useIntroSplash } from '@/hooks/useIntroSplash';

export function RootLayout() {
  useApplyTheme();
  const intro = useIntroSplash();

  return (
    <div className="min-h-full">
      {/* The app renders underneath, so it is ready when the intro opens up */}
      <Outlet />
      <AnimatePresence>
        {intro.visible && <IntroSplash key="intro" onFinish={intro.finish} />}
      </AnimatePresence>
    </div>
  );
}
