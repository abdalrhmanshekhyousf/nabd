import { z } from 'zod';
import { LAB_PRIORITIES, LAB_TEST_CODES } from '../lab.js';
import { optionalText } from './common.js';

/**
 * POST /doctors/me/patients/:id/lab-tests (task 3.4): one or more tests for my
 * patient, routine or urgent, with a note for the lab. Each becomes its own
 * test on the lab board.
 */
export const labOrderSchema = z.object({
  codes: z
    .array(z.enum(LAB_TEST_CODES as [string, ...string[]], 'validation.invalid'))
    .min(1, 'validation.required')
    .max(20, 'validation.tooMany')
    .refine((codes) => new Set(codes).size === codes.length, 'validation.invalid'),
  priority: z.enum(LAB_PRIORITIES, 'validation.required'),
  notes: optionalText(300),
});

export type LabOrderInput = z.input<typeof labOrderSchema>;
export type LabOrderData = z.output<typeof labOrderSchema>;

/**
 * POST /lab/tests/:id/result (task 3.5), sent as a form with an optional file:
 * the values written out and/or the report file, and whether it is abnormal.
 */
export const labResultSchema = z.object({
  result: optionalText(2000),
  abnormal: z.enum(['true', 'false'], 'validation.required').transform((value) => value === 'true'),
});

export type LabResultData = z.output<typeof labResultSchema>;
