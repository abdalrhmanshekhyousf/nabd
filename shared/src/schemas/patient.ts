import { z } from 'zod';
import {
  email,
  id,
  optionalBirthDate,
  optionalPhone,
  optionalText,
  phone,
  requiredText,
} from './common.js';
import { newPassword } from './hospital.js';

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * POST /auth/register/patient (task 1.30): a patient opens their own account at
 * the hospital they choose. Each hospital keeps its own patient accounts.
 */
export const registerPatientSchema = z.object({
  hospitalId: id(),
  fullName: requiredText(120),
  phone: phone(),
  gender: z.enum(GENDERS, 'validation.required'),
  dateOfBirth: optionalBirthDate(),
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

/** A field the form may leave out: missing counts as empty (null). */
const orNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined ? null : value), schema);

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

/** A patient account opened at reception: the login the patient is handed. */
export const patientAccountSchema = z.object({
  email: email(),
  password: newPassword(),
});

/**
 * POST /reception/patients (task 4.1): reception registers a patient who walked
 * in, with what the file needs from day one, and opens their account if they
 * want one (the patient gets the email and a generated password).
 */
export const receptionPatientSchema = z.object({
  fullName: requiredText(120),
  gender: z.enum(GENDERS, 'validation.required'),
  dateOfBirth: orNull(optionalBirthDate()),
  phone: orNull(optionalPhone()),
  nationalId: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, 'validation.invalid')
    .or(z.literal('').transform(() => null))
    .nullable()
    .default(null),
  bloodType: z.enum(BLOOD_TYPES, 'validation.invalid').nullable().default(null),
  address: orNull(optionalText(200)),
  allergies: orNull(optionalText(300)),
  chronicConditions: orNull(optionalText(300)),
  account: patientAccountSchema.nullable().default(null),
});

/** GET /reception/patients: by name, phone or national number. */
export const receptionSearchSchema = z.object({
  search: z.string().trim().max(100).default(''),
});

export type ReceptionPatientInput = z.input<typeof receptionPatientSchema>;
export type ReceptionPatientData = z.output<typeof receptionPatientSchema>;
export type PatientAccountData = z.output<typeof patientAccountSchema>;

/** A patient as reception finds them. */
export type ReceptionPatient = {
  patientId: string;
  fullName: string | null;
  isAnonymous: boolean;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  nationalId: string | null;
  /** The account's email, when they have one. */
  accountEmail: string | null;
  createdAt: string;
};
