import type { AuditEntry } from '@nabd/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Eye, History, PenLine, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/app/queryKeys';
import { Button, Card, Input, Select, Spinner, StatusBadge } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { enter } from '@/lib/motion';

type Page = { entries: AuditEntry[]; total: number; pageSize: number };

// The admin's activity log (task 4.22): every opening and change of a
// patient's file (4.21), newest first; filter by a person's or patient's
// name, by viewing or changing, and by dates.
export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const needle = useDebouncedValue(search.trim(), 300);
  const filters = { search: needle, action, from, to, page };
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: async () =>
      (
        await api.get<Page>('/audit', {
          params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="max-w-2xl space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('activity.title')}</h2>
        <p className="text-sm text-muted">{t('activity.description')}</p>
      </motion.div>

      <motion.div {...enter(1)}>
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label={t('activity.search')}
            icon={<Search />}
            value={search}
            onChange={(event) => reset(setSearch)(event.target.value)}
          />
          <Select
            label={t('activity.action')}
            value={action}
            options={[
              { value: '', label: t('activity.all') },
              { value: 'VIEW', label: t('activity.actions.VIEW') },
              { value: 'EDIT', label: t('activity.actions.EDIT') },
            ]}
            onChange={(event) => reset(setAction)(event.target.value)}
          />
          <Input
            label={t('activity.from')}
            type="date"
            value={from}
            onChange={(event) => reset(setFrom)(event.target.value)}
          />
          <Input
            label={t('activity.to')}
            type="date"
            value={to}
            onChange={(event) => reset(setTo)(event.target.value)}
          />
        </Card>
      </motion.div>

      <motion.section {...enter(2)} aria-label={t('activity.entries')} className="space-y-3">
        {!data ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : data.entries.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted">
            <History className="size-8 text-muted/60" aria-hidden="true" />
            {t('activity.none')}
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted">{t('activity.count', { count: data.total })}</p>
            <Card className={cn('overflow-hidden transition-opacity', isFetching && 'opacity-60')}>
              <ul className="divide-y divide-border">
                {data.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        entry.action === 'EDIT'
                          ? 'bg-warning/12 text-warning'
                          : 'bg-accent-soft text-accent',
                      )}
                    >
                      {entry.action === 'EDIT' ? (
                        <PenLine className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-foreground">
                        <span className="font-semibold">{entry.userName}</span>{' '}
                        <span className="text-muted">({t(`roles.${entry.role as 'DOCTOR'}`)})</span>{' '}
                        {t(`activity.did.${entry.action}`, {
                          patient: entry.patientName ?? t('patients.anonymous'),
                        })}
                      </p>
                      <p className="text-xs text-muted">
                        <bdi>{time.format(new Date(entry.createdAt))}</bdi>
                        {entry.ip && (
                          <>
                            {' '}
                            · <bdi dir="ltr">{entry.ip}</bdi>
                          </>
                        )}
                      </p>
                    </div>
                    <StatusBadge tone={entry.action === 'EDIT' ? 'warning' : 'info'} dot={false}>
                      {t(`activity.actions.${entry.action}`)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </Card>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('activity.newer')}
                </Button>
                <span className="text-xs text-muted tabular-nums">
                  {t('activity.page', { page: page + 1, pages })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('activity.older')}
                </Button>
              </div>
            )}
          </>
        )}
      </motion.section>
    </div>
  );
}
