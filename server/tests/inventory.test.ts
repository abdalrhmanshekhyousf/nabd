import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { moveStock } from '../src/services/inventory.service.js';
import { createHospital, createUser } from './helpers.js';

const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function pharmacy() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const pharmacist = await createUser(id, {
    email: `p-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'PHARMACIST',
  });
  await prisma.user.update({ where: { id: pharmacist.id }, data: { fullName: 'رامي العطار' } });
  const item = await prisma.inventoryItem.create({
    data: {
      hospitalId: id,
      category: 'DRUG',
      name: 'باراسيتامول 500',
      unit: 'علبة',
      minQuantity: 10,
    },
  });
  const db = forHospital(id);
  const move = (change: number, kind: 'RESTOCK' | 'DISPENSE' | 'USE' | 'ADJUST', reason?: string) =>
    db.$transaction((tx) =>
      moveStock(tx, {
        hospitalId: id,
        itemId: item.id,
        change,
        kind,
        actorId: pharmacist.id,
        reason,
      }),
    );
  return { id, db, pharmacist, item, move };
}

const quantityOf = async (id: string) =>
  (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity;

describe('inventory and stock movements (task 3.1)', () => {
  it('every change moves the quantity and is logged with who and why', async () => {
    const h = await pharmacy();

    await h.move(30, 'RESTOCK', 'توريد من المستودع');
    const { item, movement } = await h.move(-4, 'DISPENSE');

    expect(item.quantity).toBe(26);
    expect(movement).toMatchObject({ kind: 'DISPENSE', change: -4, quantityAfter: 26 });
    const log = await prisma.stockMovement.findMany({
      where: { itemId: h.item.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(log.map((m) => [m.kind, m.change, m.quantityAfter, m.byName, m.reason])).toEqual([
      ['RESTOCK', 30, 30, 'رامي العطار', 'توريد من المستودع'],
      ['DISPENSE', -4, 26, 'رامي العطار', null],
    ]);
  });

  it('never below zero: the movement is refused and nothing is written', async () => {
    const h = await pharmacy();
    await h.move(3, 'RESTOCK');

    await expect(h.move(-5, 'DISPENSE')).rejects.toMatchObject({
      status: 409,
      code: 'OUT_OF_STOCK',
      details: { available: 3, unit: 'علبة' },
    });
    expect(await quantityOf(h.item.id)).toBe(3);
    expect(await prisma.stockMovement.count({ where: { itemId: h.item.id } })).toBe(1);
    await expect(h.move(0, 'ADJUST')).rejects.toMatchObject({ status: 400 });
  });

  it('tells when an item just reached its minimum, once', async () => {
    const h = await pharmacy();
    await h.move(12, 'RESTOCK');

    expect((await h.move(-1, 'DISPENSE')).becameLow).toBe(false);
    expect((await h.move(-1, 'DISPENSE')).becameLow).toBe(true);
    expect((await h.move(-1, 'DISPENSE')).becameLow).toBe(false);
    expect((await h.move(20, 'RESTOCK')).becameLow).toBe(false);
  });

  it('two dispenses of the last boxes at once: one gets them', async () => {
    const h = await pharmacy();
    await h.move(5, 'RESTOCK');

    const results = await Promise.allSettled([h.move(-3, 'DISPENSE'), h.move(-3, 'DISPENSE')]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await quantityOf(h.item.id)).toBe(2);
  });

  it('the database itself refuses negative stock, and names repeat only across categories', async () => {
    const h = await pharmacy();
    await expect(
      prisma.inventoryItem.update({ where: { id: h.item.id }, data: { quantity: -1 } }),
    ).rejects.toThrow(/InventoryItem_quantity_not_negative|check constraint/i);
    await expect(
      prisma.inventoryItem.create({
        data: { hospitalId: h.id, category: 'DRUG', name: 'باراسيتامول 500', unit: 'علبة' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.inventoryItem.create({
        data: { hospitalId: h.id, category: 'LAB', name: 'باراسيتامول 500', unit: 'علبة' },
      }),
    ).resolves.toBeTruthy();
  });

  it('another hospital cannot move this stock; a removed employee stays named in the log', async () => {
    const h = await pharmacy();
    const other = await pharmacy();
    await h.move(10, 'RESTOCK');

    await expect(
      other.db.$transaction((tx) =>
        moveStock(tx, {
          hospitalId: other.id,
          itemId: h.item.id,
          change: -1,
          kind: 'DISPENSE',
          actorId: other.pharmacist.id,
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    await prisma.user.delete({ where: { id: h.pharmacist.id } });
    expect(await prisma.stockMovement.findFirst({ where: { itemId: h.item.id } })).toMatchObject({
      byId: null,
      byName: 'رامي العطار',
    });
  });
});
