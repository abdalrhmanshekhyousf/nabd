import { api } from '@/lib/api';

// Device notifications (task 3.26): the browser's permission, its push
// subscription, and telling the server where to send this person's reminders.

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** The worker that receives pushes; registered on demand (dev has none at start). */
async function worker() {
  return (
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await navigator.serviceWorker.register('/sw.js'))
  );
}

function keyBytes(base64url: string) {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks the browser, subscribes, and registers the subscription with the server. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  const { publicKey } = (await api.get<{ publicKey: string | null }>('/push/key')).data;
  if (!publicKey) return 'unsupported';
  const registration = await worker();
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const { endpoint, keys } = subscription.toJSON();
  await api.post('/push/subscriptions', { endpoint, keys });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
  return 'off';
}
