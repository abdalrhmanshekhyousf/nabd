import { z } from 'zod';
import { email, optionalEmail, phone, requiredText } from './common.js';

/** Name, address and contact details of a hospital. */
export const hospitalInfoSchema = z.object({
  name: requiredText(120),
  address: requiredText(250),
  phone: phone(),
  email: optionalEmail(),
});

/** A password chosen for a new account: 8+ characters with letters and digits. */
export const newPassword = () =>
  z
    .string()
    .min(8, 'validation.passwordTooShort')
    .max(200, 'validation.tooLong')
    .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'validation.passwordWeak');

/** POST /auth/register: a new hospital and its first admin, created together. */
export const registerHospitalSchema = z.object({
  hospital: hospitalInfoSchema,
  admin: z.object({
    fullName: requiredText(120),
    email: email(),
    password: newPassword(),
  }),
});

/** The sign-up form: the request plus a password confirmation (checked in the browser). */
export const registerHospitalFormSchema = registerHospitalSchema.extend({
  admin: registerHospitalSchema.shape.admin
    .extend({ confirmPassword: z.string() })
    .refine((admin) => admin.password === admin.confirmPassword, {
      message: 'validation.passwordMismatch',
      path: ['confirmPassword'],
    }),
});

/** PATCH /hospital: the admin edits the hospital's details. */
export const updateHospitalSchema = hospitalInfoSchema;

export type HospitalInfoInput = z.input<typeof hospitalInfoSchema>;
export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;
export type RegisterHospitalFormInput = z.input<typeof registerHospitalFormSchema>;
