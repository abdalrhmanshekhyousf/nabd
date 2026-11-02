import type { NotificationItem } from '@nabd/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import i18n from '@/i18n';
import { describeNotification } from '@/lib/notificationText';
import { notify } from '@/lib/notify';
import { startRealtime } from '@/lib/realtime';
import { useSessionStore } from '@/stores/sessionStore';

/** What GET /notifications returns, cached for the bell (task 2.4). */
export type NotificationsData = { notifications: NotificationItem[]; unread: number };

/**
 * Keeps the signed-in user connected for live updates (task 2.3): each
 * notification becomes a toast (urgent ones ring), joins the cached list,
 * and refresh events make open screens fetch their data again.
 */
export function useRealtime() {
  const userId = useSessionStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Read through a ref so a new navigate function doesn't reopen the connection.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    return startRealtime({
      onNotification: (item) => {
        queryClient.setQueryData<NotificationsData>(queryKeys.notifications, (cached) =>
          cached && !cached.notifications.some((n) => n.id === item.id)
            ? { notifications: [item, ...cached.notifications], unread: cached.unread + 1 }
            : cached,
        );
        const { title, body } = describeNotification(item);
        const link = item.link;
        notify.alert(title, {
          id: item.id,
          urgent: item.urgent,
          description: body,
          action: link
            ? { label: i18n.t('notifications.open'), onClick: () => void navigateRef.current(link) }
            : undefined,
        });
      },
      onRefresh: ({ queryKeys: keys }) => {
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
      },
    });
  }, [userId, queryClient]);
}
