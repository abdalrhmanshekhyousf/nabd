import { z } from 'zod';
import { id } from './common.js';

/**
 * POST /pharmacy/prescriptions/:id/dispense (task 3.10): for each medicine,
 * the stock item handed over and how many, or nothing when it is not
 * available (no item, quantity 0).
 */
export const dispenseSchema = z.object({
  lines: z
    .array(
      z.object({
        prescriptionItemId: id(),
        inventoryItemId: id().nullable(),
        quantity: z
          .number('validation.required')
          .int('validation.invalid')
          .min(0, 'validation.invalid')
          .max(1000, 'validation.tooMany'),
      }),
    )
    .min(1, 'validation.required')
    .refine((lines) => lines.every((l) => (l.inventoryItemId === null) === (l.quantity === 0)), {
      message: 'validation.invalid',
    }),
});

export type DispenseInput = z.input<typeof dispenseSchema>;
export type DispenseData = z.output<typeof dispenseSchema>;
