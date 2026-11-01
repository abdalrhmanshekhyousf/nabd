import { AnimatePresence, motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { calm, calmSpring, withViewTransition } from '@/lib/motion';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <motion.button
      type="button"
      onClick={() => withViewTransition('language', () => void setLanguage(next))}
      aria-label={t('language.switchToLabel')}
      whileTap={{ scale: 0.96 }}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-muted px-4 text-sm text-foreground transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <motion.span
        key={i18n.language}
        className="text-accent"
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={calmSpring}
      >
        <Languages className="size-4" aria-hidden="true" />
      </motion.span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={next}
          lang={next}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={calm}
        >
          {t('language.switchTo')}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
