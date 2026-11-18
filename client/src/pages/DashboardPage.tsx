import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AdminHome } from '@/components/dashboard/AdminHome';
import { RoleHome } from '@/components/dashboard/RoleHome';
import { enter } from '@/lib/motion';
import { useSessionStore } from '@/stores/sessionStore';

// Every role's home: the admin's at a glance (4.20), the others' today's work.
export function DashboardPage() {
  const { t } = useTranslation();
  const fullName = useSessionStore((state) => state.user?.fullName ?? '');
  const role = useSessionStore((state) => state.user?.role);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.h2 {...enter(0)} className="text-2xl font-bold text-foreground">
        {t('dashboard.welcome', { name: fullName })}
      </motion.h2>
      {role === 'ADMIN' ? <AdminHome /> : <RoleHome />}
    </div>
  );
}
