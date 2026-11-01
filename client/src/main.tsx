import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/readex-pro';
import { queryClient } from '@/app/queryClient';
import { router } from '@/app/router';
import '@/i18n';
import { LoadingScreen } from '@/components/brand/LoadingScreen';
import { initSession } from '@/lib/session';
import '@/index.css';

// Restore the previous session (refresh cookie) while the first screen renders.
void initSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Framer Motion follows the device "reduce motion" setting everywhere */}
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        {/* Shown while lazy pages or the session check (task 1.19) are loading */}
        <Suspense fallback={<LoadingScreen />}>
          <RouterProvider router={router} />
        </Suspense>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
