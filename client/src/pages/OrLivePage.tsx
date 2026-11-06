import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { OrLiveBoard } from '@/components/operatingRooms/OrLiveBoard';
import { enter } from '@/lib/motion';

// The live operating room board (task 2.26), for the admin, doctors and the
// nurses outside the operating room team.
export function OrLivePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">{t('orLive.title')}</h2>
        <p className="text-sm text-muted">{t('orLive.description')}</p>
      </motion.div>
      <motion.div {...enter(1)}>
        <OrLiveBoard />
      </motion.div>
    </div>
  );
}
