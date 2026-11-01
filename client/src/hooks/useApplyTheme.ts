import { useEffect } from 'react';
import { applyTheme, DARK_MEDIA_QUERY } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';

// Keeps <html> in sync with the chosen theme, and with the device setting while
// the choice is "system" (e.g. the OS switches to dark at sunset).
export function useApplyTheme() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;

    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
