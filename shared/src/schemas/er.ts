import { z } from 'zod';
import { CONSCIOUSNESS_LEVELS, EXPECTED_EXAMS } from '../triage.js';
import { GENDERS } from './patient.js';
import { optionalBirthDate, optionalPhone, optionalText, requiredText } from './common.js';

/** What every arrival needs: why they came, and how (task 2.11). */
const arrival = {
  gender: z.enum(GENDERS, 'validation.required').nullable(),
  chiefComplaint: requiredText(300),
  arrivalNote: optionalText(300),
};

/**
 * POST /er/visits: the quick registration of an emergency arrival. A known
 * patient gives their name (the national ID finds them if they were here
 * before); an unidentified one only how they look and why they came.
 */
export const quickRegistrationSchema = z.discriminatedUnion('anonymous', [
  z.object({ anonymous: z.literal(true), ...arrival }),
  z.object({
    anonymous: z.literal(false),
    fullName: requiredText(120),
    phone: optionalPhone(),
    dateOfBirth: optionalBirthDate(),
    nationalId: optionalText(30),
    ...arrival,
  }),
]);

export type QuickRegistrationInput = z.input<typeof quickRegistrationSchema>;
export type QuickRegistrationData = z.output<typeof quickRegistrationSchema>;

/** A measured value within what is humanly possible, or null when not measured. */
const vital = (min: number, max: number, step: 'int' | 'tenth' = 'int') =>
  z
    .number('validation.invalid')
    .min(min, 'validation.invalid')
    .max(max, 'validation.invalid')
    .refine(
      (value) => (step === 'int' ? Number.isInteger(value) : Number.isInteger(value * 10)),
      'validation.invalid',
    )
    .nullable();

/**
 * PUT /er/visits/:id/triage: the triage form (task 2.12). Vital signs may be
 * left out when they could not be measured; the rest is always answered.
 */
export const triageSchema = z.object({
  chiefComplaint: requiredText(300),
  breathing: z.boolean('validation.required'),
  consciousness: z.enum(CONSCIOUSNESS_LEVELS, 'validation.required'),
  pulse: vital(20, 250),
  systolic: vital(40, 260),
  diastolic: vital(20, 160),
  respiratoryRate: vital(4, 60),
  oxygenSaturation: vital(50, 100),
  temperature: vital(30, 43, 'tenth'),
  painScore: z.number('validation.required').int().min(0).max(10),
  expectedExams: z.union(
    EXPECTED_EXAMS.map((value) => z.literal(value)) as [
      z.ZodLiteral<0>,
      z.ZodLiteral<1>,
      z.ZodLiteral<2>,
    ],
    'validation.required',
  ),
});

export type TriageInput = z.input<typeof triageSchema>;
export type TriageData = z.output<typeof triageSchema>;
