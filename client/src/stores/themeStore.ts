import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';

// Must match the key read by the pre-paint script in index.html.
export const THEME_STORAGE_KEY = 'nabd-theme';
const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

type ThemeState = {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
};

// The choice is kept on this device right away. Once login exists (task 1.18) the
// user's saved theme is loaded into this store and changes are sent to their account.
export const useThemeStore = create<ThemeState>()((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be blocked (private mode); the theme still applies for this visit.
    }
    set({ theme });
  },
}));
