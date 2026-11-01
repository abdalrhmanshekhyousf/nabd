type Listener = (event: { matches: boolean }) => void;

let systemDark = false;
const listeners = new Set<Listener>();

// Fake of window.matchMedia for '(prefers-color-scheme: dark)'.
function matchMedia(query: string) {
  const isDarkQuery = query.includes('prefers-color-scheme: dark');
  return {
    media: query,
    get matches() {
      return isDarkQuery && systemDark;
    },
    addEventListener: (_type: 'change', listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: Listener) => listeners.delete(listener),
  } as unknown as MediaQueryList;
}

/** Simulates the OS switching between light and dark. */
export function setSystemDarkMode(dark: boolean) {
  systemDark = dark;
  listeners.forEach((listener) => listener({ matches: dark }));
}
setSystemDarkMode.matchMedia = matchMedia;
