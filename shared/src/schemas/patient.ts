import { z } from 'zod';
import { email, id, phone, requiredText } from './common.js';
import { newPassword } from './hospital.js';

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

/** Today as YYYY-MM-DD in the device's own time zone. */
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** An optional date of birth (YYYY-MM-DD, as a date input gives it); empty becomes null. */
const dateOfBirth = () =>
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

/**
 * POST /auth/register/patient (task 1.30): a patient opens their own account at
 * the hospital they choose. Each hospital keeps its own patient accounts.
 */
export const registerPatientSchema = z.object({
  hospitalId: id(),
  fullName: requiredText(120),
  phone: phone(),
  gender: z.enum(GENDERS, 'validation.required'),
  dateOfBirth: dateOfBirth(),
  email: email(),
  password: newPassword(),
});

/** The sign-up form: the request plus a password confirmation (checked in the browser). */
export const registerPatientFormSchema = registerPatientSchema
  .extend({ confirmPassword: z.string() })
  .refine((patient) => patient.password === patient.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

/** GET /public/hospitals: the list a patient picks from, optionally searched by name. */
export const hospitalSearchSchema = z.object({
  search: z.string().trim().max(100).optional(),
});

export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export type RegisterPatientFormInput = z.input<typeof registerPatientFormSchema>;
export type RegisterPatientFormData = z.output<typeof registerPatientFormSchema>;
