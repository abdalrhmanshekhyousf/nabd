import { z } from 'zod';
import { optionalText, requiredText } from './common.js';

/**
 * POST /cleaning-requests (task 2.25): a nurse asks the cleaners of their
 * department to clean a place in it.
 */
export const createCleaningRequestSchema = z.object({
  place: requiredText(120),
  note: optionalText(300),
});

export type CreateCleaningRequestInput = z.input<typeof createCleaningRequestSchema>;
export type CreateCleaningRequestData = z.output<typeof createCleaningRequestSchema>;
