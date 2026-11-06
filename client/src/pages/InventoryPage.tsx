import { INVENTORY_CATEGORY_OF_ROLE } from '@nabd/shared';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { InventoryPanel } from '@/components/inventory/InventoryPanel';
import { enter } from '@/lib/motion';
import { useSessionStore } from '@/stores/sessionStore';

// Each specialist's stock page (task 3.2): the pharmacy's medicines and
// supplies, the lab's reagents, imaging's films and contrast.
export function InventoryPage() {
  const { t } = useTranslation();
  const role = useSessionStore((s) => s.user?.role);
  const category = role ? INVENTORY_CATEGORY_OF_ROLE[role] : undefined;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div {...enter(0)} className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">
          {category ? t(`inventory.title.${category}`) : t('nav.inventory')}
        </h2>
        <p className="text-sm text-muted">{t('inventory.description')}</p>
      </motion.div>
      <motion.div {...enter(1)}>
        <InventoryPanel />
      </motion.div>
    </div>
  );
}
