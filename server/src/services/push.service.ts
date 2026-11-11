import {
  HOSPITAL_TIME_ZONE,
  type NotificationData,
  type NotificationType,
  type PushSubscriptionData,
} from '@nabd/shared';
import * as webpush from 'web-push';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

/**
 * Device notifications (task 3.26): Web Push reaches a browser that agreed,
 * even with the site closed. Only what a patient must not miss goes this way;
 * everything else stays in the app's bell.
 */
export const PUSH_TYPES: readonly NotificationType[] = [
  'MEDICATION_REMINDER',
  'FOLLOW_UP_REMINDER',
  'APPOINTMENT_CANCELLED',
];

export type PushMessage = { title: string; body: string; url: string; tag: string };
type Target = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Sends one message to one browser; throws with statusCode 404/410 when it is gone. */
export type PushTransport = (target: Target, payload: string) => Promise<unknown>;

const configured = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
if (configured) webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

let transport: PushTransport | null = configured
  ? (target, payload) => webpush.sendNotification(target, payload, { TTL: 60 * 60 })
  : null;

/** Tests swap the push service for a fake one. */
export function setPushTransport(next: PushTransport | null) {
  transport = next;
}

export const pushPublicKey = () => (configured ? env.vapidPublicKey : null);

/** The sentence, in the reader's language: the browser shows it without the app. */
function text(type: NotificationType, data: NotificationData, language: 'AR' | 'EN') {
  const ar = language === 'AR';
  const v = (key: string) => String(data[key] ?? '');
  switch (type) {
    case 'MEDICATION_REMINDER':
      return ar
        ? { title: `صار وقت ${v('drug')}`, body: `${v('dose')} · الساعة ${v('time')}` }
        : { title: `Time for ${v('drug')}`, body: `${v('dose')} · at ${v('time')}` };
    case 'FOLLOW_UP_REMINDER': {
      const when = new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: HOSPITAL_TIME_ZONE,
      }).format(new Date(v('startsAt')));
      const soon = data.kind === 'SOON';
      return ar
        ? { title: soon ? 'موعدك قرّب' : 'عندك موعد بكرة', body: `مع ${v('doctor')} · ${when}` }
        : {
            title: soon ? 'Your visit is soon' : 'You have a visit tomorrow',
            body: `With ${v('doctor')} · ${when}`,
          };
    }
    case 'APPOINTMENT_CANCELLED':
      return ar
        ? {
            title: 'انلغى موعدك',
            body: `موعدك مع ${v('doctor')} انلغى لأن الطبيب بإجازة. احجز من جديد.`,
          }
        : {
            title: 'Your visit was cancelled',
            body: `Your visit with ${v('doctor')} was cancelled: the doctor is on vacation. Please book again.`,
          };
    default:
      return ar
        ? { title: 'نبض', body: 'عندك إشعار جديد' }
        : { title: 'Nabd', body: 'You have a new notification' };
  }
}

/** Sends to every browser of these people; a browser that is gone is forgotten. */
export async function pushTo(
  userIds: string[],
  type: NotificationType,
  data: NotificationData,
  link: string | null,
) {
  if (!transport || userIds.length === 0) return 0;
  const send = transport;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      user: { select: { language: true } },
    },
  });
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const message: PushMessage = {
        ...text(type, data, subscription.user.language),
        url: link ?? '/',
        tag: `${type}-${String(data.reminderId ?? data.appointmentId ?? '')}-${String(data.dueAt ?? '')}`,
      };
      try {
        await send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(message),
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
        }
      }
    }),
  );
  return sent;
}

/** A browser agreed to notifications for this person (one row per browser). */
export async function subscribe(
  hospitalId: string,
  userId: string,
  { endpoint, keys }: PushSubscriptionData,
  userAgent: string | null,
) {
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { hospitalId, userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { hospitalId, userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
}

export async function unsubscribe(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}
