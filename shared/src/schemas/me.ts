import { z } from 'zod';

/** PATCH /me/preferences: interface language and display mode, saved to the account. */
export const preferencesSchema = z
  .strictObject({
    language: z.enum(['AR', 'EN']).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  })
  .refine((body) => body.language !== undefined || body.theme !== undefined, {
    message: 'validation.required',
  });

export type PreferencesInput = z.infer<typeof preferencesSchema>;
