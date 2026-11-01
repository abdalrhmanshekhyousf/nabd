import { motion } from 'framer-motion';
import { LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui';
import { enter } from '@/lib/motion';
import { useSessionStore } from '@/stores/sessionStore';

// Empty dashboard shared by every role for now; each role's own content arrives with its tasks.
export function DashboardPage() {
  const { t } = useTranslation();
  const fullName = useSessionStore((state) => state.user?.fullName ?? '');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.h2 {...enter(0)} className="text-2xl font-bold text-foreground">
        {t('dashboard.welcome', { name: fullName })}
      </motion.h2>
      <motion.div {...enter(1)}>
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <LayoutDashboard className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-md text-sm text-muted">{t('dashboard.empty')}</p>
        </Card>
      </motion.div>
    </div>
  );
}
