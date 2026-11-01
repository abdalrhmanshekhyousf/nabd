import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold text-danger">404</p>
      <p className="text-muted">{t('errors.notFound')}</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
      >
        {/* "Back" points left in English and right in Arabic */}
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t('common.backHome')}
      </Link>
    </main>
  );
}
