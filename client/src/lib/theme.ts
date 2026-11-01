import type { ThemeChoice } from '@/stores/themeStore';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

// Colors are CSS variables keyed on the `dark` class, so this switches instantly.
export function applyTheme(choice: ThemeChoice) {
  document.documentElement.classList.toggle('dark', resolveTheme(choice) === 'dark');
}
