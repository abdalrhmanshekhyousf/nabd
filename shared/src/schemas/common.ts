import { z } from 'zod';

// Building blocks for every form and request body. Messages are translation keys
// (validation.*): the client shows them in the user's language; the server only
// passes them along in error details.

/** Trimmed, lower-cased email, so " Admin@Nabd.Demo" matches the stored one. */
export const email = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'validation.emailRequired')
    .pipe(z.email('validation.emailInvalid').max(254, 'validation.tooLong'));

/** A password typed to sign in (any non-empty value; strength rules are for new ones). */
export const currentPassword = () =>
  z.string().min(1, 'validation.passwordRequired').max(200, 'validation.tooLong');

/** Required text, trimmed, with a maximum length. */
export const requiredText = (max = 200) =>
  z.string().trim().min(1, 'validation.required').max(max, 'validation.tooLong');

export const id = () => z.uuid('validation.invalid');

/** Optional text that becomes null when empty. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullable()
    .transform((value) => value || null);

/**
 * An optional email: an empty field becomes null. Null is accepted as input too,
 * because the client sends this schema's own output to the server.
 */
export const optionalEmail = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'validation.tooLong')
    .nullable()
    .refine((value) => !value || z.email().safeParse(value).success, 'validation.emailInvalid')
    .transform((value) => value || null);

/** A phone number: digits with optional +, spaces, dashes and brackets. */
export const phone = () =>
  z
    .string()
    .trim()
    .min(1, 'validation.required')
    .regex(/^\+?[\d\s\-()]{6,20}$/, 'validation.phoneInvalid');

/** An optional phone number: an empty field becomes null. */
export const optionalPhone = () =>
  z
    .string()
    .trim()
    .nullable()
    .refine((value) => !value || /^\+?[\d\s\-()]{6,20}$/.test(value), 'validation.phoneInvalid')
    .transform((value) => value || null);

/** Today as YYYY-MM-DD in the device's own time zone. */
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** An optional date of birth (YYYY-MM-DD, as a date input gives it); empty becomes null. */
export const optionalBirthDate = () =>
  z
    .string()
    .trim()
    .nullable()
    .refine(
      (value) =>
        !value ||
        (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(value)) &&
          value >= '1900-01-01' &&
          value <= today()),
      'validation.dateInvalid',
    )
    .transform((value) => value || null);
