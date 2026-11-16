import type { AdminOverview, BedStatus } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BedDouble,
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  FileText,
  HeartPulse,
  MessageSquareWarning,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { BED_TONE } from '@/components/rooms/bedStyles';
import { Card, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { enter } from '@/lib/motion';

function Tile({
  to,
  icon,
  label,
  value,
  hint,
  alert = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Card className="flex h-full items-start gap-3 p-4 transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-lifted">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            alert ? 'bg-warning/12 text-warning' : 'bg-accent-soft text-accent',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="block text-xs text-muted">{label}</span>
          <bdi className="block text-2xl font-bold text-foreground tabular-nums">{value}</bdi>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      </Card>
    </Link>
  );
}

// The admin's home (task 4.20): the hospital at a glance, each figure a way in
// to the page that deals with it.
export function AdminHome() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.overview,
    queryFn: async () => (await api.get<AdminOverview>('/profit/overview')).data,
    // Requests, complaints and payments arrive all day: a fresh look every minute.
    refetchInterval: 60_000,
  });
  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  const pending = data.pending.leave + data.pending.purchases + data.pending.repairs;
  const totalBeds = data.beds.reduce((sum, row) => sum + row.count, 0);
  const free = data.beds.find((row) => row.status === 'EMPTY')?.count ?? 0;

  return (
    <div className="space-y-6">
      <motion.div {...enter(1)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          to="/admin/staff"
          icon={<Users className="size-5" aria-hidden="true" />}
          label={t('adminHome.staff')}
          value={data.staff.total}
          hint={t('adminHome.awayToday', { count: data.staff.awayToday })}
        />
        <Tile
          to="/admin/approvals"
          icon={<ClipboardCheck className="size-5" aria-hidden="true" />}
          label={t('adminHome.pending')}
          value={pending}
          hint={t('adminHome.pendingHint', data.pending)}
          alert={pending > 0}
        />
        <Tile
          to="/admin/complaints"
          icon={<MessageSquareWarning className="size-5" aria-hidden="true" />}
          label={t('adminHome.complaints')}
          value={data.openComplaints}
          alert={data.openComplaints > 0}
        />
        <Tile
          to="/admin/profit"
          icon={<TrendingUp className="size-5" aria-hidden="true" />}
          label={t('adminHome.profit')}
          value={formatMoney(data.month.profit, i18n.language)}
          hint={t('adminHome.revenue', { amount: formatMoney(data.month.revenue, i18n.language) })}
        />
      </motion.div>

      <motion.div {...enter(2)} className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <Link
            to="/admin/bed-map"
            className="flex items-center gap-2 font-semibold text-foreground hover:text-accent"
          >
            <BedDouble className="size-5 text-accent" aria-hidden="true" />
            {t('adminHome.beds', { free, total: totalBeds })}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {data.beds.map((row) => (
              <StatusBadge key={row.status} tone={BED_TONE[row.status as BedStatus]}>
                {t(`bedStatus.${row.status as BedStatus}`)} ·{' '}
                <span className="tabular-nums">{row.count}</span>
              </StatusBadge>
            ))}
          </div>
        </Card>
        <Card className="space-y-3 p-4">
          <Link
            to="/admin/or-live"
            className="flex items-center gap-2 font-semibold text-foreground hover:text-accent"
          >
            <HeartPulse className="size-5 text-accent" aria-hidden="true" />
            {t('adminHome.operatingRooms')}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {data.operatingRooms.map((row) => (
              <StatusBadge key={row.status} tone="neutral">
                {t(`orStatus.${row.status as 'AVAILABLE'}`)} ·{' '}
                <span className="tabular-nums">{row.count}</span>
              </StatusBadge>
            ))}
          </div>
        </Card>
      </motion.div>

      <motion.div {...enter(3)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          to="/admin/meetings"
          icon={<CalendarClock className="size-5" aria-hidden="true" />}
          label={t('adminHome.meetings')}
          value={data.upcomingMeetings}
        />
        <Tile
          to="/admin/reports"
          icon={<FileText className="size-5" aria-hidden="true" />}
          label={t('adminHome.reports')}
          value={data.unreadReports}
          alert={data.unreadReports > 0}
        />
        <Tile
          to="/admin/approvals"
          icon={<CalendarOff className="size-5" aria-hidden="true" />}
          label={t('adminHome.leave')}
          value={data.pending.leave}
        />
      </motion.div>
    </div>
  );
}
