import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './controlClasses';
import { Field, type FieldProps } from './Field';

export type TextareaProps = ComponentProps<'textarea'> &
  Pick<FieldProps, 'label' | 'hint' | 'error'> & { containerClassName?: string };

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  containerClassName,
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      {(control) => (
        <textarea
          {...control}
          rows={rows}
          className={cn(controlClasses, 'min-h-24 resize-y px-3 py-2.5', className)}
          {...props}
        />
      )}
    </Field>
  );
}
