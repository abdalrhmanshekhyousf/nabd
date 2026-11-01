import { AnimatePresence, motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FieldProps = {
  label: string;
  /** Helper text under the control; hidden while an error is shown. */
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the ids to wire the control to its label, hint and error. */
  children: (control: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
    required: boolean | undefined;
  }) => ReactNode;
};

// Label + control + hint/error, wired for screen readers. Used by Input, Textarea
// and Select; works with React Hook Form by passing its error message.
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ms-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
        required,
      })}
      <AnimatePresence mode="wait" initial={false}>
        {message && (
          <motion.p
            key={error ? 'error' : 'hint'}
            id={messageId}
            role={error ? 'alert' : undefined}
            className={cn('text-xs', error ? 'text-danger' : 'text-muted')}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
