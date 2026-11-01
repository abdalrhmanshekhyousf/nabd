import { useTranslation } from 'react-i18next';
import { NabdLogo } from '@/components/brand/NabdLogo';

export function PoweredBy() {
  const { t } = useTranslation();
  return (
    <p lang="en" dir="ltr" className="flex items-center justify-center gap-1.5 text-xs text-muted">
      <NabdLogo className="text-sm text-foreground" />
      {t('shell.poweredBy')}
    </p>
  );
}
