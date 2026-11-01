import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-surface-muted text-foreground hover:bg-border',
  outline: 'border border-border bg-surface text-foreground hover:bg-surface-muted',
  ghost: 'text-foreground hover:bg-surface-muted',
  danger: 'bg-danger text-danger-foreground hover:bg-danger/90',
  success: 'bg-success text-success-foreground hover:bg-success/90',
} as const;

// md and lg meet the 44px minimum touch target.
const SIZES = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
  icon: 'size-11',
} as const;

export type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Shows a spinner, disables the button and announces the busy state. */
  loading?: boolean;
  /** Icon shown before the label (on the reading-start side). */
  icon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const { t } = useTranslation();
  const inactive = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors select-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {loading && size === 'icon' ? <span className="sr-only">{t('common.loading')}</span> : null}
      {size === 'icon' && loading ? null : children}
    </motion.button>
  );
}
