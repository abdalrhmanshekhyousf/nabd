import type { ValidationKey } from '@nabd/shared';

/** Validation messages are translation keys; server messages arrive translated. */
export function fieldError(message: string | undefined, t: (key: ValidationKey) => string) {
  if (!message) return undefined;
  return message.startsWith('validation.') ? t(message as ValidationKey) : message;
}
