import type { NotificationItem } from '@nabd/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff, CheckCheck, Siren } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { Popover, Spinner } from '@/components/ui';
import type { NotificationsData } from '@/hooks/useRealtime';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { calm, calmSpring } from '@/lib/motion';
import { describeNotification } from '@/lib/notificationText';
import { relativeTime } from '@/lib/relativeTime';

/** Marks read on screen first; the server's answer (or a refresh) settles it. */
function useMarkRead() {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  const now = () => new Date().toISOString();

  const one = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onMutate: (id) =>
      queryClient.setQueryData<NotificationsData>(queryKeys.notifications, (cached) =>
        cached
          ? {
              notifications: cached.notifications.map((n) =>
                n.id === id && !n.readAt ? { ...n, readAt: now() } : n,
              ),
              unread: Math.max(
                0,
                cached.unread -
                  (cached.notifications.some((n) => n.id === id && !n.readAt) ? 1 : 0),
              ),
            }
          : cached,
      ),
    onSettled: settle,
  });
  const all = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onMutate: () =>
      queryClient.setQueryData<NotificationsData>(queryKeys.notifications, (cached) =>
        cached
          ? {
              notifications: cached.notifications.map((n) => ({ ...n, readAt: n.readAt ?? now() })),
              unread: 0,
            }
          : cached,
      ),
    onSettled: settle,
  });
  return { one, all };
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const { title, body } = describeNotification(item);
  const unread = !item.readAt;

  return (
    <motion.li layout transition={calm}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
          unread && 'bg-accent-soft/50',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            item.urgent ? 'bg-danger/12 text-danger' : 'bg-accent-soft text-accent',
          )}
        >
          {item.urgent ? (
            <Siren className="size-4" aria-label={t('shell.urgentMark')} />
          ) : (
            <Bell className="size-4" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm text-foreground',
              unread ? 'font-semibold' : 'font-normal',
            )}
          >
            {title}
          </span>
          {body && <span className="block truncate text-xs text-muted">{body}</span>}
          <span className="mt-0.5 block text-[11px] text-muted">
            {relativeTime(item.createdAt, i18n.language)}
          </span>
        </span>
        <AnimatePresence initial={false}>
          {unread && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={calmSpring}
              className="mt-2 size-2 shrink-0 rounded-full bg-accent"
              role="img"
              aria-label={t('shell.unreadMark')}
            />
          )}
        </AnimatePresence>
      </button>
    </motion.li>
  );
}

// The bell in the top bar (task 2.4): unread count, the latest notifications,
// and marking them read. New ones arrive live (task 2.3).
export function NotificationsMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async () => (await api.get<NotificationsData>('/notifications')).data,
  });
  const markRead = useMarkRead();
  const unreadCount = data?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  const label =
    unreadCount > 0
      ? `${t('shell.notifications')}: ${t('shell.unread', { count: unreadCount })}`
      : t('shell.notifications');

  return (
    <Popover
      label={label}
      panelClassName="sm:w-80"
      trigger={
        <>
          <Bell className="size-[18px]" aria-hidden="true" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key={unreadCount}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={calmSpring}
                className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-danger-foreground"
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      }
    >
      {(close) => (
        <div className="flex max-h-[min(28rem,calc(100dvh-6rem))] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{t('shell.notifications')}</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead.all.mutate()}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                {t('shell.markAllRead')}
              </button>
            )}
          </div>

          {isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-muted/60 px-4 py-6 text-center">
                <BellOff className="size-6 text-muted" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{t('shell.noNotifications')}</p>
                <p className="text-xs text-muted">{t('shell.notificationsHint')}</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-0.5 overflow-y-auto p-1.5">
              {notifications.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (!item.readAt) markRead.one.mutate(item.id);
                    if (item.link) {
                      close();
                      void navigate(item.link);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
