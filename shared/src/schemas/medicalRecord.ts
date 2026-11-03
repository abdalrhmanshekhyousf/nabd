import { z } from 'zod';
import { optionalText, requiredText } from './common.js';

/** POST /doctors/me/patients/:id/reports: a medical report in the file (task 2.8). */
export const createReportSchema = z.object({
  title: requiredText(120),
  diagnosis: optionalText(300),
  content: requiredText(5000),
});

export const MAX_PRESCRIPTION_ITEMS = 20;

/** One medicine: what, how much, how often, for how long. */
export const prescriptionItemSchema = z.object({
  drugName: requiredText(120),
  dose: requiredText(60),
  frequency: requiredText(60),
  durationDays: z
    .number('validation.invalid')
    .int('validation.invalid')
    .min(1, 'validation.invalid')
    .max(365, 'validation.tooMany')
    .nullable(),
  instructions: optionalText(200),
});

/** POST /doctors/me/patients/:id/prescriptions: one or more medicines (task 2.8). */
export const createPrescriptionSchema = z.object({
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'validation.required')
    .max(MAX_PRESCRIPTION_ITEMS, 'validation.tooMany'),
  notes: optionalText(300),
});

export type CreateReportInput = z.input<typeof createReportSchema>;
export type CreateReportData = z.output<typeof createReportSchema>;
export type CreatePrescriptionInput = z.input<typeof createPrescriptionSchema>;
export type CreatePrescriptionData = z.output<typeof createPrescriptionSchema>;
