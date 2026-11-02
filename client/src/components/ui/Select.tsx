import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { controlClasses } from './controlClasses';
import { Field, type FieldProps } from './Field';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<ComponentProps<'select'>, 'children'> &
  Pick<FieldProps, 'label' | 'hint' | 'error' | 'hideLabel'> & {
    options: SelectOption[];
    /** Empty first option, e.g. "Choose a department". */
    placeholder?: string;
    containerClassName?: string;
  };

// A styled native <select>: the phone's own picker opens on mobile, and keyboard
// and screen reader support come for free.
export function Select({
  label,
  hint,
  error,
  hideLabel,
  options,
  placeholder,
  required,
  className,
  containerClassName,
  ...props
}: SelectProps) {
  // Start on the placeholder; otherwise the browser skips a disabled placeholder
  // and silently picks the first real option.
  const startOnPlaceholder =
    placeholder !== undefined && props.value === undefined && props.defaultValue === undefined;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={containerClassName}
    >
      {(control) => (
        <div className="relative">
          <select
            {...control}
            className={cn(
              controlClasses,
              'h-11 cursor-pointer appearance-none ps-3 pe-10',
              className,
            )}
            defaultValue={startOnPlaceholder ? '' : undefined}
            {...props}
          >
            {placeholder !== undefined && (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted transition-colors group-focus-within/field:text-accent"
            aria-hidden="true"
          />
        </div>
      )}
    </Field>
  );
}
