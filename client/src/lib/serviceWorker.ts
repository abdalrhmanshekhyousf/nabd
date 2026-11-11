// The installed app (task 3.25): the service worker is registered in the built
// app only, so development always sees fresh files.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without it the app still works, just not offline.
    });
  });
}

/** The browser's install offer, kept for the "install the app" button. */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the offer for our own button instead of the browser's mini bar.
    event.preventDefault();
    offer = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    notify();
  });
}

export const installOffer = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  available: () => offer !== null,
  async install() {
    if (!offer) return false;
    const current = offer;
    offer = null;
    notify();
    await current.prompt();
    return (await current.userChoice).outcome === 'accepted';
  },
};
