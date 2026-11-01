import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      onClick={() => void setLanguage(next)}
      aria-label={t('language.switchToLabel')}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Languages className="size-4 text-muted" aria-hidden="true" />
      <span lang={next}>{t('language.switchTo')}</span>
    </button>
  );
}
