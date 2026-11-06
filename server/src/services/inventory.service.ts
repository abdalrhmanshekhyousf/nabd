import { isLowStock, type StockMovementKind } from '@nabd/shared';
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
