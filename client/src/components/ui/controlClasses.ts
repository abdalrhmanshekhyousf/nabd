import { cn } from '@/lib/cn';

/** Shared look for text inputs, textareas and selects. */
export const controlClasses = cn(
  'w-full rounded-lg border border-border bg-surface text-sm text-foreground transition-colors',
  'placeholder:text-muted/70',
  'focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/30',
);
