import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './controlClasses';
import { Field, type FieldProps } from './Field';

export type InputProps = Omit<ComponentProps<'input'>, 'children'> &
  Pick<FieldProps, 'label' | 'hint' | 'error'> & {
    /** Icon inside the field, on the reading-start side. */
    icon?: ReactNode;
    /** Control inside the field on the reading-end side (e.g. show password). */
    end?: ReactNode;
    containerClassName?: string;
  };

// `ref` is a normal prop in React 19, so {...register('name')} from React Hook Form works.
export function Input({
  label,
  hint,
  error,
  icon,
  end,
  required,
  className,
  containerClassName,
  ...props
}: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {(control) => (
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted transition-colors group-focus-within/field:text-accent [&>svg]:size-4">
              {icon}
            </span>
          )}
          <input
            {...control}
            className={cn(controlClasses, 'h-11 px-3', icon && 'ps-10', end && 'pe-11', className)}
            {...props}
          />
          {end && <span className="absolute inset-y-0 end-1 flex items-center">{end}</span>}
        </div>
      )}
    </Field>
  );
}
