import { motion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover } from '@/components/ui';
import { calmSpring } from '@/lib/motion';

// Bell with the unread count. The list itself and live delivery arrive with the
// notifications system (tasks 2.1–2.4); until then it shows the empty state.
export function NotificationsMenu({ unreadCount = 0 }: { unreadCount?: number }) {
  const { t } = useTranslation();
  const label =
    unreadCount > 0
      ? `${t('shell.notifications')}: ${t('shell.unread', { count: unreadCount })}`
      : t('shell.notifications');

  return (
    <Popover
      label={label}
      trigger={
        <>
          <Bell className="size-[18px]" aria-hidden="true" />
          {unreadCount > 0 && (
            <motion.span
              key={unreadCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={calmSpring}
              className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-danger-foreground"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </>
      }
    >
      {() => (
        <div className="p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">{t('shell.notifications')}</p>
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-muted/60 px-4 py-6 text-center">
            <BellOff className="size-6 text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t('shell.noNotifications')}</p>
            <p className="text-xs text-muted">{t('shell.notificationsHint')}</p>
          </div>
        </div>
      )}
    </Popover>
  );
}
