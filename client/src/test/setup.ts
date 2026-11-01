import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import i18n from '@/i18n';
import { setSystemDarkMode } from './matchMedia';

// jsdom has no matchMedia; this fake lets tests flip the device theme.
vi.stubGlobal('matchMedia', setSystemDarkMode.matchMedia);

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('ar');
  localStorage.clear();
  document.documentElement.className = '';
  setSystemDarkMode(false);
});
