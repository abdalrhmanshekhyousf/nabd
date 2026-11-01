import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { enter } from '@/lib/motion';

// The language and theme toggles move to the top bar in task 1.14.
export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <motion.div
        {...enter(2)}
        className="absolute inset-x-4 top-4 flex flex-wrap items-center justify-end gap-2"
      >
        <LanguageToggle />
        <ThemeToggle />
      </motion.div>
      <motion.div {...enter(0)}>
        <NabdLogo withWordmark className="text-4xl sm:text-5xl" />
      </motion.div>
      <motion.p {...enter(1)} className="text-muted">
        {t('app.tagline')}
      </motion.p>
    </main>
  );
}
