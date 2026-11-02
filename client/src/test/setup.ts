import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import i18n from '@/i18n';
import { setSystemDarkMode } from './matchMedia';
import { fakeSockets } from './fakeSocket';

// findBy* waits up to 1s by default; the whole suite running at once (three
// workspaces in parallel) can take longer to render a page. Passing queries
// still return as soon as the element appears.
configure({ asyncUtilTimeout: 3000 });

// jsdom has no matchMedia; this fake lets tests flip the device theme.
vi.stubGlobal('matchMedia', setSystemDarkMode.matchMedia);

// jsdom has no pointer capture; Sonner uses it when a toast is pressed.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;

// jsdom has no object URLs (used to show images fetched with the access token).
let objectUrls = 0;
URL.createObjectURL ??= () => `blob:test/${++objectUrls}`;
URL.revokeObjectURL ??= () => undefined;

afterEach(async () => {
  cleanup();
  fakeSockets.length = 0;
  await i18n.changeLanguage('ar');
  localStorage.clear();
  document.documentElement.className = '';
  setSystemDarkMode(false);
});
