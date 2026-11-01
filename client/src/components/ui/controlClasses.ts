import { cn } from '@/lib/cn';

/** Shared look for text inputs, textareas and selects. */
export const controlClasses = cn(
  'w-full rounded-lg border border-input bg-surface text-sm text-foreground transition-[border-color,box-shadow,background-color]',
  'placeholder:text-muted/70 hover:border-muted/50',
  'focus:border-accent focus:ring-[3px] focus:ring-accent-soft focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20',
);
