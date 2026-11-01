import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { calmSpring } from '@/lib/motion';
import { Spinner } from './Spinner';

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/88 hover:shadow-lifted',
  secondary: 'bg-surface-muted text-foreground hover:bg-border',
  outline:
    'border border-input bg-surface text-foreground hover:border-muted/40 hover:bg-surface-muted',
  ghost: 'text-foreground hover:bg-surface-muted',
  danger: 'bg-danger text-danger-foreground shadow-soft hover:bg-danger/88 hover:shadow-lifted',
  success: 'bg-success text-success-foreground shadow-soft hover:bg-success/88 hover:shadow-lifted',
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
      whileHover={inactive ? undefined : { y: -1 }}
      whileTap={inactive ? undefined : { scale: 0.97, y: 0 }}
      transition={calmSpring}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity] select-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
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
