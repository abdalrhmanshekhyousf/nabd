// Nabd's service worker (task 3.25). It keeps the app's own files so it opens
// fast and shows its shell (or an offline page) without a connection. Patient
// and hospital data (anything under /api) is never stored on the device.
// It also shows the reminders pushed by the server (task 3.26, below).
const VERSION = 'v2';
const SHELL = `nabd-shell-${VERSION}`;
const ASSETS = `nabd-assets-${VERSION}`;
const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only our own files; never the API, wherever it lives.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Pages: the network first (fresh app), the kept shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? (await caches.match('/offline.html'))),
    );
    return;
  }

  // Built files carry a hash in their name and never change: keep them.
  if (/^\/(assets|icons|brand)\//.test(url.pathname) || url.pathname === '/favicon.svg') {
    event.respondWith(
      caches.match(request).then(
        (kept) =>
          kept ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// Device notifications (task 3.26): medication and follow-up reminders reach
// the patient even with the site closed. The server writes the sentence in
// their language; tapping it opens (or focuses) the page it is about.
self.addEventListener('push', (event) => {
  let message = { title: 'نبض · Nabd', body: '', url: '/', tag: undefined };
  try {
    message = { ...message, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A message that is not ours: show the plain fallback.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: message.tag || undefined,
      data: { url: message.url },
      lang: 'ar',
      dir: 'auto',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
