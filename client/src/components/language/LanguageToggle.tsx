import { AnimatePresence, motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { cn } from '@/lib/cn';
import { calm, calmSpring, withViewTransition } from '@/lib/motion';
import { playSound } from '@/lib/sound';

type LanguageToggleProps = {
  /** Icon-sized button showing only the target language code (phone top bars). */
  compact?: boolean;
};

export function LanguageToggle({ compact = false }: LanguageToggleProps) {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <motion.button
      type="button"
      onClick={() => {
        playSound('toggle');
        withViewTransition('language', () => void setLanguage(next));
      }}
      aria-label={t('language.switchToLabel')}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full text-sm text-foreground transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
        compact
          ? 'size-9 font-semibold text-muted hover:bg-surface-muted hover:text-foreground'
          : 'h-11 bg-surface-muted px-4 hover:bg-border',
      )}
    >
      {!compact && (
        <motion.span
          key={i18n.language}
          className="text-accent"
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={calmSpring}
        >
          <Languages className="size-4" aria-hidden="true" />
        </motion.span>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={next}
          lang={next}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={calm}
        >
          {compact ? t('language.short') : t('language.switchTo')}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
