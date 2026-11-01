import { useTranslation } from 'react-i18next';
import { NabdLogo } from '@/components/brand/NabdLogo';
import { LanguageToggle } from '@/components/language/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

// The language and theme toggles move to the top bar in task 1.14.
export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="absolute inset-x-4 top-4 flex flex-wrap items-center justify-end gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <NabdLogo withWordmark className="text-4xl sm:text-5xl" />
      <p className="text-muted">{t('app.tagline')}</p>
    </main>
  );
}
