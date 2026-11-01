import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster as SonnerToaster } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { directionOf, isLanguage } from '@/i18n';
import { resolveTheme } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';

// Sonner reads its colors from these variables; pointing them at our tokens keeps
// toasts calm and in sync with light/dark mode.
const STYLE = {
  '--normal-bg': 'var(--surface)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--foreground)',
  '--border-radius': '0.875rem',
  fontFamily: 'inherit',
} as CSSProperties;

const ICONS = {
  success: <CircleCheck className="size-5 text-success" />,
  error: <CircleAlert className="size-5 text-danger" />,
  warning: <TriangleAlert className="size-5 text-warning" />,
  info: <Info className="size-5 text-info" />,
  loading: <Spinner className="size-5 text-accent" />,
  close: <X className="size-3.5" />,
};

// Toasts sit at the bottom on the reading-end side (right in English, left in
// Arabic) and flip with the language. Call `toast` from 'sonner' anywhere.
export function Toaster() {
  const { t, i18n } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const dir = directionOf(isLanguage(i18n.language) ? i18n.language : 'ar');

  return (
    <SonnerToaster
      dir={dir}
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      theme={resolveTheme(theme)}
      closeButton
      gap={10}
      icons={ICONS}
      style={STYLE}
      containerAriaLabel={t('toast.region')}
      toastOptions={{
        classNames: {
          toast: 'shadow-lifted! gap-3! text-sm!',
          description: 'text-muted!',
          actionButton: 'bg-primary! text-primary-foreground! rounded-md! font-medium!',
          cancelButton: 'bg-surface-muted! text-foreground! rounded-md!',
          closeButton: 'bg-surface! border-border! text-muted! hover:text-foreground!',
        },
      }}
    />
  );
}
