// @nabd/shared: one definition of every input rule and shared constant, used by
// the client forms and the server routes alike.
export * from './errors.js';
export * from './roles.js';
export * from './schemas/auth.js';
export * from './schemas/common.js';
export * from './schemas/hospital.js';
export * from './schemas/me.js';

/** Translation keys used as validation messages (client: validation.*). */
export const VALIDATION_KEYS = [
  'validation.required',
  'validation.invalid',
  'validation.tooLong',
  'validation.emailRequired',
  'validation.emailInvalid',
  'validation.passwordRequired',
  'validation.passwordTooShort',
  'validation.passwordWeak',
  'validation.passwordMismatch',
  'validation.phoneInvalid',
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];
