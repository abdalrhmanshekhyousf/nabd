import { z } from 'zod';
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
