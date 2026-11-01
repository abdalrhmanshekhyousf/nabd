import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links on the reading-end side of the header. */
  action?: ReactNode;
  className?: string;
};

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <header
      className={cn('flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5', className)}
    >
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-border p-4 sm:px-5',
        className,
      )}
      {...props}
    />
  );
}
