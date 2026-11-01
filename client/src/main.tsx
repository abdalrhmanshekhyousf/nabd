import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/readex-pro';
import { router } from '@/app/router';
import '@/i18n';
import { LoadingScreen } from '@/components/brand/LoadingScreen';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Shown while lazy pages or the session check (task 1.19) are loading */}
    <Suspense fallback={<LoadingScreen />}>
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
