import { z } from 'zod';
import { INVENTORY_CATEGORIES } from '../inventory.js';
import { optionalText, requiredText } from './common.js';

/** A count of units: whole, not negative, and within reason. */
const count = (min: number) =>
  z
    .number('validation.required')
    .int('validation.invalid')
    .min(min, 'validation.invalid')
    .max(1_000_000, 'validation.tooMany');

/**
 * POST /inventory (task 3.2): a new item in my stock, with what is on the
 * shelf now (recorded as the first movement).
 */
export const createInventoryItemSchema = z.object({
  name: requiredText(120),
  unit: requiredText(30),
  quantity: count(0),
  minQuantity: count(0),
  notes: optionalText(300),
});

/** PATCH /inventory/:id: the item's details. The quantity changes only by movements. */
export const updateInventoryItemSchema = createInventoryItemSchema.omit({ quantity: true });

/**
 * POST /inventory/:id/movements: stock received, used, or a count that
 * corrects the quantity (it needs a reason).
 */
export const stockMovementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RESTOCK'), amount: count(1), reason: optionalText(200) }),
  z.object({ kind: z.literal('USE'), amount: count(1), reason: optionalText(200) }),
  z.object({ kind: z.literal('ADJUST'), counted: count(0), reason: requiredText(200) }),
]);

/** GET /inventory: search, only what runs low, and (for the admin) whose stock. */
export const inventoryQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  low: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
});

export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;
export type CreateInventoryItemData = z.output<typeof createInventoryItemSchema>;
export type UpdateInventoryItemData = z.output<typeof updateInventoryItemSchema>;
export type StockMovementInput = z.input<typeof stockMovementSchema>;
export type StockMovementData = z.output<typeof stockMovementSchema>;
