import {
  INVENTORY_CATEGORY_OF_ROLE,
  isLowStock,
  type CreateInventoryItemData,
  type InventoryCategory,
  type InventoryItemView,
  type Role,
  type StockMovementData,
  type StockMovementKind,
  type StockMovementView,
  type UpdateInventoryItemData,
} from '@nabd/shared';
import { Prisma, type InventoryItem } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

/**
 * The one way an item's quantity changes (task 3.1): the item row is locked,
 * the new quantity may not go below zero, and the change is written to the
 * movement log with who made it. Dispensing (3.10) and the inventory screens
 * (3.2) all go through here. `becameLow` tells the caller to warn (3.3): the
 * item just reached its minimum.
 */
export async function moveStock(
  tx: Tx,
  {
    hospitalId,
    itemId,
    change,
    kind,
    actorId,
    reason = null,
    prescriptionItemId = null,
  }: {
    hospitalId: string;
    itemId: string;
    change: number;
    kind: StockMovementKind;
    actorId: string;
    reason?: string | null;
    prescriptionItemId?: string | null;
  },
) {
  if (!Number.isInteger(change) || change === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A movement changes the quantity by a whole number',
    );
  }
  await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${itemId}::uuid FOR UPDATE`;
  const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item not found');
  const quantityAfter = item.quantity + change;
  if (quantityAfter < 0) {
    throw new HttpError(409, 'OUT_OF_STOCK', `Only ${item.quantity} ${item.unit} left`, {
      available: item.quantity,
      unit: item.unit,
    });
  }
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
  const updated = await tx.inventoryItem.update({
    where: { id: itemId },
    data: { quantity: quantityAfter },
  });
  const movement = await tx.stockMovement.create({
    data: {
      hospitalId,
      itemId,
      kind,
      change,
      quantityAfter,
      reason,
      byId: actorId,
      byName: actor?.fullName ?? '',
      prescriptionItemId,
    },
  });
  return {
    item: updated,
    movement,
    becameLow: !isLowStock(item) && isLowStock(updated),
  };
}

function toItemView(item: InventoryItem): InventoryItemView {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    minQuantity: item.minQuantity,
    notes: item.notes,
    low: isLowStock(item),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const naturally = new Intl.Collator('ar', { numeric: true });

/**
 * Whose stock this person works with (task 3.2): their own as pharmacist, lab
 * technician or radiologist; the admin chooses.
 */
export function inventoryCategoryFor(
  role: Role,
  asked: InventoryCategory | undefined,
): InventoryCategory {
  if (role === 'ADMIN') return asked ?? 'DRUG';
  const own = INVENTORY_CATEGORY_OF_ROLE[role];
  if (!own) throw new HttpError(403, 'FORBIDDEN', 'No stock to look after');
  return own;
}

/** The stock list: by name, optionally searched, or only what runs low. */
export async function listItems(
  db: ScopedPrisma,
  category: InventoryCategory,
  { search, low }: { search: string; low: boolean },
) {
  const items = await db.inventoryItem.findMany({
    where: { category, ...(search && { name: { contains: search, mode: 'insensitive' } }) },
  });
  return items
    .filter((item) => !low || isLowStock(item))
    .sort((a, b) => naturally.compare(a.name, b.name))
    .map(toItemView);
}

async function requireItem(db: ScopedPrisma, id: string, category: InventoryCategory) {
  const item = await db.inventoryItem.findFirst({ where: { id, category } });
  if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item not found');
  return item;
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'ITEM_EXISTS', 'An item with this name is already in stock');
  }
  throw error;
}

/** A new item; what is already on the shelf is its first movement. */
export async function createItem(
  db: ScopedPrisma,
  hospitalId: string,
  actorId: string,
  category: InventoryCategory,
  { name, unit, quantity, minQuantity, notes }: CreateInventoryItemData,
) {
  try {
    const item = await db.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: { hospitalId, category, name, unit, minQuantity, notes },
      });
      if (quantity === 0) return created;
      const moved = await moveStock(tx, {
        hospitalId,
        itemId: created.id,
        change: quantity,
        kind: 'RESTOCK',
        actorId,
      });
      return moved.item;
    });
    return toItemView(item);
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/** The item's name, unit, minimum and notes; the quantity moves only by movements. */
export async function updateItem(
  db: ScopedPrisma,
  category: InventoryCategory,
  id: string,
  data: UpdateInventoryItemData,
) {
  await requireItem(db, id, category);
  try {
    return toItemView(await db.inventoryItem.update({ where: { id }, data }));
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/**
 * Stock received (+), used (−), or counted: a count sets the quantity, as a
 * movement of the difference. Returns the item and whether it just ran low.
 */
export async function recordMovement(
  db: ScopedPrisma,
  hospitalId: string,
  actorId: string,
  category: InventoryCategory,
  id: string,
  input: StockMovementData,
) {
  await requireItem(db, id, category);
  const result = await db.$transaction(async (tx) => {
    if (input.kind === 'ADJUST') {
      // Locked before reading, so a dispense at the same moment cannot skew the difference.
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      const change = input.counted - current.quantity;
      if (change === 0) return { item: current, becameLow: false };
      return moveStock(tx, {
        hospitalId,
        itemId: id,
        change,
        kind: 'ADJUST',
        actorId,
        reason: input.reason,
      });
    }
    return moveStock(tx, {
      hospitalId,
      itemId: id,
      change: input.kind === 'RESTOCK' ? input.amount : -input.amount,
      kind: input.kind,
      actorId,
      reason: input.reason,
    });
  });
  return { item: toItemView(result.item), becameLow: result.becameLow };
}

/** The item's movements, latest first. */
export async function itemMovements(db: ScopedPrisma, category: InventoryCategory, id: string) {
  await requireItem(db, id, category);
  const rows = await db.stockMovement.findMany({
    where: { itemId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((row): StockMovementView => ({
    id: row.id,
    kind: row.kind,
    change: row.change,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    byName: row.byName,
    createdAt: row.createdAt.toISOString(),
  }));
}
