import { z } from 'zod';
import { requiredText } from './common.js';

/**
 * POST /leave (task 4.5): any staff member asks for days off, local dates with
 * the last one included, and why.
 */
export const leaveRequestSchema = z
  .object({
    from: z.iso.date('validation.required'),
    to: z.iso.date('validation.required'),
    reason: requiredText(300),
  })
  .refine(({ from, to }) => from <= to, { message: 'validation.invalid', path: ['to'] })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) <= 90 * 86_400_000, {
    message: 'validation.invalid',
    path: ['to'],
  });

export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;
export type LeaveRequestData = z.output<typeof leaveRequestSchema>;
