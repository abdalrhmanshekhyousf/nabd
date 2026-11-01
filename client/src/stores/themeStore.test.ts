import { describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from './themeStore';

// The store reads storage once when the module loads, so each case re-imports it.
async function loadStore() {
  vi.resetModules();
  return (await import('./themeStore')).useThemeStore;
}

describe('themeStore', () => {
  it('restores a saved choice', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect((await loadStore()).getState().theme).toBe('dark');
  });

  it('falls back to "system" for missing or invalid values', async () => {
    expect((await loadStore()).getState().theme).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect((await loadStore()).getState().theme).toBe('system');
  });
});
