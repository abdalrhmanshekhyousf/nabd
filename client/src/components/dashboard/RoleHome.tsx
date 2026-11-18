import type { HomeTile } from '@nabd/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '@/app/queryKeys';
import { Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { hospitalFormat } from '@/lib/hospitalTime';
import { formatMoney } from '@/lib/money';
import { enter } from '@/lib/motion';

function Tile({ tile }: { tile: HomeTile }) {
  const { t, i18n } = useTranslation();
  const format = hospitalFormat(i18n.language);
  const value =
    tile.at !== undefined
      ? tile.at
        ? format.full(tile.at)
        : t('home.none')
      : tile.value === null
        ? null
        : tile.money
          ? formatMoney(tile.value, i18n.language)
          : String(tile.value);
  return (
    <Link
      to={tile.to}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Card
        className={cn(
          'flex h-full flex-col gap-2 p-4 transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-lifted',
          tile.alert && 'border-warning/50',
        )}
      >
        <span className="flex items-center justify-between gap-2 text-sm text-muted">
          {t(`home.tiles.${tile.key as "calls"}`)}
          <ArrowLeft
            className="size-4 shrink-0 text-muted/60 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180"
            aria-hidden="true"
          />
        </span>
        {value !== null && (
          <bdi
            className={cn(
              'font-bold text-foreground tabular-nums',
              tile.at !== undefined ? 'text-lg' : 'text-3xl',
              tile.alert && 'text-warning',
            )}
          >
            {value}
          </bdi>
        )}
        {tile.detail && <span className="text-xs text-muted">{tile.detail}</span>}
        {tile.hint !== undefined && (
          <span className="text-xs text-muted">{t('home.invoices', { count: tile.hint })}</span>
        )}
      </Card>
    </Link>
  );
}

// Each role's home (after 4.24): today's figures of that role's work, each a
// way into the page that deals with it.
export function RoleHome() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.roleHome,
    queryFn: async () => (await api.get<{ tiles: HomeTile[] }>('/me/home')).data.tiles,
    refetchInterval: 60_000,
  });
  if (!Array.isArray(data)) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  return (
    <motion.section {...enter(1)} aria-label={t('home.today')} className="space-y-3">
      <h3 className="text-sm font-semibold text-muted">{t('home.today')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.map((tile) => (
          <Tile key={tile.key} tile={tile} />
        ))}
      </div>
    </motion.section>
  );
}
