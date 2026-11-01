import { Outlet } from 'react-router';
import { useApplyTheme } from '@/hooks/useApplyTheme';

export function RootLayout() {
  useApplyTheme();

  return (
    <div className="min-h-full">
      <Outlet />
    </div>
  );
}
