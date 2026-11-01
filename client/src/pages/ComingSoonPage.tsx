import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMatches } from 'react-router';
import type { RouteHandle } from '@/app/navigation';
import { Card, StatusBadge } from '@/components/ui';
import { calmSpring, enter } from '@/lib/motion';

// Placeholder for sidebar pages that later tasks build (task 1.20). The route
// handle says which page it is and which phase of the plan delivers it.
export function ComingSoonPage() {
  const { t } = useTranslation();
  const handle = useMatches().at(-1)?.handle as RouteHandle | undefined;
  const phase = handle?.phase ?? 1;

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div {...enter(0)}>
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <motion.span
            className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"
            initial={{ rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={calmSpring}
          >
            <Construction className="size-7" aria-hidden="true" />
          </motion.span>
          {handle?.titleKey && (
            <h2 className="text-xl font-semibold text-foreground">{t(handle.titleKey)}</h2>
          )}
          <StatusBadge tone="info">{t('comingSoon.phase', { phase })}</StatusBadge>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{t('comingSoon.title')}</p>
            <p className="max-w-md text-sm text-muted">{t('comingSoon.body', { phase })}</p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
