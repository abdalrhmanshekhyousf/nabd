import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Tinted background + strong text/dot of the same color, readable in both themes.
const TONES = {
  neutral: 'bg-surface-muted text-muted [--dot:var(--muted)]',
  success: 'bg-success/12 text-success [--dot:var(--success)]',
  warning: 'bg-warning/12 text-warning [--dot:var(--warning)]',
  danger: 'bg-danger/12 text-danger [--dot:var(--danger)]',
  info: 'bg-info/12 text-info [--dot:var(--info)]',
  'esi-1': 'bg-esi-1 text-white [--dot:white]',
  'esi-2': 'bg-esi-2 text-white [--dot:white]',
  'esi-3': 'bg-esi-3 text-ink [--dot:var(--nabd-ink)]',
  'esi-4': 'bg-esi-4 text-white [--dot:white]',
  'esi-5': 'bg-esi-5 text-white [--dot:white]',
} as const;

export type StatusTone = keyof typeof TONES;

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
  /** Show the colored dot (on by default). */
  dot?: boolean;
  /** Pulse the dot for states that need attention now (critical patient, urgent call). */
  pulse?: boolean;
  className?: string;
};

export function StatusBadge({
  tone = 'neutral',
  children,
  dot = true,
  pulse = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-300',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-2" aria-hidden="true">
          {pulse && (
            <span className="absolute inset-0 animate-ping rounded-full bg-(--dot) opacity-75 motion-reduce:hidden" />
          )}
          <span className="relative size-2 rounded-full bg-(--dot)" />
        </span>
      )}
      {children}
    </span>
  );
}
