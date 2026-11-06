import type { Role } from './roles.js';

/** Stock is kept per department kind (task 3.1). Match the Prisma enum. */
export const INVENTORY_CATEGORIES = ['DRUG', 'LAB', 'RADIOLOGY'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

/** Why a quantity changed. Match the Prisma enum. */
export const STOCK_MOVEMENT_KINDS = ['RESTOCK', 'DISPENSE', 'USE', 'ADJUST'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

/** Whose stock each role looks after (3.2) and is warned about (3.3). */
export const INVENTORY_CATEGORY_OF_ROLE: Partial<Record<Role, InventoryCategory>> = {
  PHARMACIST: 'DRUG',
  LAB_TECHNICIAN: 'LAB',
  RADIOLOGIST: 'RADIOLOGY',
};

/** At or under its minimum: time to order more (3.3). */
export function isLowStock({ quantity, minQuantity }: { quantity: number; minQuantity: number }) {
  return quantity <= minQuantity;
}

/** One stocked item, as the inventory screens show it. */
export type InventoryItemView = {
  id: string;
  category: InventoryCategory;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  notes: string | null;
  low: boolean;
  updatedAt: string;
};

/** One line of an item's movement log. */
export type StockMovementView = {
  id: string;
  kind: StockMovementKind;
  change: number;
  quantityAfter: number;
  reason: string | null;
  byName: string;
  createdAt: string;
};
