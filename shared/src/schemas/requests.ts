import { z } from 'zod';
import { optionalText, requiredText } from './common.js';

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

const money = z.coerce
  .number('validation.invalid')
  .min(0, 'validation.invalid')
  .max(100_000_000, 'validation.invalid');

/**
 * POST /department-requests/purchases (task 4.6): the department head asks to
 * buy what is short: items, quantities and what each costs.
 */
export const purchaseRequestSchema = z.object({
  items: z
    .array(
      z.object({
        inventoryItemId: z.uuid().nullable().default(null),
        name: requiredText(120),
        unit: optionalText(30).default(null),
        quantity: z.coerce
          .number('validation.invalid')
          .int()
          .min(1, 'validation.invalid')
          .max(100_000),
        unitCost: money,
      }),
    )
    .min(1, 'validation.required')
    .max(50),
  note: optionalText(300).default(null),
});

export type PurchaseRequestInput = z.input<typeof purchaseRequestSchema>;
export type PurchaseRequestData = z.output<typeof purchaseRequestSchema>;

/** POST /department-requests/repairs (user addition): equipment that needs repair. */
export const repairRequestSchema = z.object({
  equipment: requiredText(120),
  description: requiredText(500),
  urgency: z.enum(['LOW', 'NORMAL', 'URGENT'], 'validation.required'),
});

export type RepairRequestInput = z.input<typeof repairRequestSchema>;
export type RepairRequestData = z.output<typeof repairRequestSchema>;

/** What the admin decides on (task 4.7). */
export const REQUEST_KINDS = ['leave', 'purchase', 'repair'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** POST /approvals/:kind/:id (task 4.7): approve, or reject saying why. */
export const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED'], 'validation.required'),
  note: optionalText(300).default(null),
});

export type DecisionInput = z.input<typeof decisionSchema>;
export type DecisionData = z.output<typeof decisionSchema>;
