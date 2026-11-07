// Phase 3 of the demo (task 3.2): the stock of the pharmacy, the lab and
// imaging, entered by their own specialists through the inventory service, so
// every item starts with its opening movement. Added once: skipped when the
// hospital already keeps any stock.
import type { InventoryCategory } from '@nabd/shared';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { createItem, recordMovement } from '../src/services/inventory.service.js';
import { LAB, PHARMACY, RADIOLOGY, type CatalogLine } from './inventoryCatalog.js';

const STOCK: { category: InventoryCategory; keeper: string; lines: CatalogLine[] }[] = [
  { category: 'DRUG', keeper: 'pharmacist@nabd.demo', lines: PHARMACY },
  { category: 'LAB', keeper: 'lab@nabd.demo', lines: LAB },
  { category: 'RADIOLOGY', keeper: 'radiology@nabd.demo', lines: RADIOLOGY },
];

/** A day's work on a few items, so their movement log has a story. */
const DAY: Record<string, { kind: 'USE' | 'RESTOCK'; amount: number; reason: string }[]> = {
  'سيروم ملحي 0.9% 500 مل': [
    { kind: 'USE', amount: 40, reason: 'الإسعاف' },
    { kind: 'RESTOCK', amount: 100, reason: 'توريد من المستودع المركزي' },
    { kind: 'USE', amount: 25, reason: 'العمليات' },
  ],
  'شاش معقم 10×10 سم': [{ kind: 'USE', amount: 15, reason: 'الإسعاف' }],
  'أنابيب EDTA بنفسجي': [{ kind: 'USE', amount: 120, reason: 'سحوبات الصباح' }],
  'أفلام أشعة 35×43 سم': [{ kind: 'USE', amount: 35, reason: 'صور صدر' }],
};

/**
 * A test's share of a list: its first lines, every low one and every one with
 * a day's work, so the checks still see each case without the whole catalog.
 */
export function sampleOf(lines: CatalogLine[]) {
  return lines.filter(
    ([name, , quantity, min], index) => index < 5 || quantity <= min || name in DAY,
  );
}

/** The stock, once. `sample` seeds only each list's sample (fast, for tests). */
export async function seedInventory(hospitalId: string, { sample = false } = {}) {
  if ((await prisma.inventoryItem.count({ where: { hospitalId } })) > 0) return false;
  const db = forHospital(hospitalId);
  for (const { category, keeper, lines } of STOCK) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { hospitalId_email: { hospitalId, email: keeper } },
    });
    for (const [name, unit, quantity, minQuantity] of sample ? sampleOf(lines) : lines) {
      const item = await createItem(db, hospitalId, user.id, category, {
        name,
        unit,
        quantity,
        minQuantity,
        notes: null,
      });
      for (const step of DAY[name] ?? []) {
        await recordMovement(db, hospitalId, user.id, category, item.id, step);
      }
    }
  }
  return true;
}
