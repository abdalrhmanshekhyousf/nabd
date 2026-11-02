import type { NotificationItem } from '@nabd/shared';
import i18n from '@/i18n';

/**
 * The sentence for a notification, in the reader's language (the server sends
 * only the type and its details). Types whose details are shown get a body.
 */
export function describeNotification({ type, data }: Pick<NotificationItem, 'type' | 'data'>) {
  const bodyKey = `notifications.body.${type}` as const;
  return {
    title: i18n.t(`notifications.types.${type}`),
    body: i18n.exists(bodyKey) ? i18n.t(bodyKey as never, data) : undefined,
  };
}
