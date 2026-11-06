import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

type Role = 'ADMIN' | 'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGIST' | 'NURSE';

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: Role, fullName: string) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      list: (query: Record<string, string> = {}) =>
        request(app).get('/api/inventory').query(query).set(auth),
      add: (body: object, query: Record<string, string> = {}) =>
        request(app)
          .post('/api/inventory')
          .query(query)
          .set(auth)
          .send({ notes: null, minQuantity: 10, quantity: 0, ...body }),
      edit: (itemId: string, body: object) =>
        request(app).patch(`/api/inventory/${itemId}`).set(auth).send(body),
      move: (itemId: string, body: object) =>
        request(app)
          .post(`/api/inventory/${itemId}/movements`)
          .set(auth)
          .send({ reason: null, ...body }),
      log: (itemId: string) => request(app).get(`/api/inventory/${itemId}/movements`).set(auth),
    };
  }
  return { id, person };
}

describe('inventory screens (task 3.2)', () => {
  it('each specialist adds to and sees only their own stock', async () => {
    const h = await hospital();
    const pharmacist = await h.person('PHARMACIST', 'رامي العطار');
    const lab = await h.person('LAB_TECHNICIAN', 'هبة الشامي');

    const added = await pharmacist.add({
      name: 'سيروم ملحي 0.9% 500 مل',
      unit: 'كيس',
      quantity: 40,
    });
    expect(added.status).toBe(201);
    expect(added.body.item).toMatchObject({ category: 'DRUG', quantity: 40, low: false });
    await lab.add({ name: 'أنابيب EDTA', unit: 'أنبوب', quantity: 5 });

    const drugs = (await pharmacist.list()).body;
    expect(drugs.category).toBe('DRUG');
    expect(drugs.items.map((i: { name: string }) => i.name)).toEqual(['سيروم ملحي 0.9% 500 مل']);
    expect((await lab.list()).body.items).toEqual([
      expect.objectContaining({ name: 'أنابيب EDTA', category: 'LAB', low: true }),
    ]);
    // The opening stock is the first movement.
    expect((await pharmacist.log(added.body.item.id)).body.movements).toEqual([
      expect.objectContaining({
        kind: 'RESTOCK',
        change: 40,
        quantityAfter: 40,
        byName: 'رامي العطار',
      }),
    ]);
    // Not in their stock: not found.
    expect((await lab.log(added.body.item.id)).status).toBe(404);
  });

  it('receives, uses and counts stock; refuses using more than there is', async () => {
    const h = await hospital();
    const pharmacist = await h.person('PHARMACIST', 'رامي العطار');
    const item = (await pharmacist.add({ name: 'شاش معقم', unit: 'علبة', quantity: 20 })).body.item;

    expect(
      (await pharmacist.move(item.id, { kind: 'RESTOCK', amount: 30 })).body.item.quantity,
    ).toBe(50);
    const used = await pharmacist.move(item.id, { kind: 'USE', amount: 45, reason: 'الإسعاف' });
    expect(used.body).toMatchObject({ item: { quantity: 5, low: true }, becameLow: true });
    const tooMuch = await pharmacist.move(item.id, { kind: 'USE', amount: 6 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatchObject({ code: 'OUT_OF_STOCK', details: { available: 5 } });
    expect((await pharmacist.move(item.id, { kind: 'ADJUST', counted: 3 })).status).toBe(400);
    const counted = await pharmacist.move(item.id, {
      kind: 'ADJUST',
      counted: 3,
      reason: 'جرد آخر الشهر',
    });
    expect(counted.body.item.quantity).toBe(3);

    const log = (await pharmacist.log(item.id)).body.movements;
    expect(log.map((m: { kind: string; change: number }) => `${m.kind}${m.change}`)).toEqual([
      'ADJUST-2',
      'USE-45',
      'RESTOCK30',
      'RESTOCK20',
    ]);
  });

  it('search, the low filter, edits and duplicate names', async () => {
    const h = await hospital();
    const pharmacist = await h.person('PHARMACIST', 'رامي العطار');
    await pharmacist.add({ name: 'أموكسيسيلين 500 ملغ', unit: 'علبة', quantity: 50 });
    const low = (await pharmacist.add({ name: 'أسبرين 81 ملغ', unit: 'علبة', quantity: 4 })).body
      .item;

    expect((await pharmacist.list({ search: 'أموكس' })).body.items).toHaveLength(1);
    expect(
      (await pharmacist.list({ low: 'true' })).body.items.map((i: { id: string }) => i.id),
    ).toEqual([low.id]);
    const edited = await pharmacist.edit(low.id, {
      name: 'أسبرين 81 ملغ',
      unit: 'علبة',
      minQuantity: 2,
      notes: 'مع الأكل',
    });
    expect(edited.body.item).toMatchObject({
      minQuantity: 2,
      low: false,
      quantity: 4,
      notes: 'مع الأكل',
    });
    const duplicate = await pharmacist.add({ name: 'أموكسيسيلين 500 ملغ', unit: 'علبة' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ITEM_EXISTS');
  });

  it('the admin looks at any stock; others have none', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', 'المدير');
    const radiologist = await h.person('RADIOLOGIST', 'كريم داوود');
    await radiologist.add({ name: 'أفلام أشعة 35×43', unit: 'فيلم', quantity: 100 });

    expect((await admin.list({ category: 'RADIOLOGY' })).body.items).toHaveLength(1);
    expect((await admin.list()).body).toMatchObject({ category: 'DRUG', items: [] });
    expect((await (await h.person('NURSE', 'لينا')).list()).status).toBe(403);
  });
});
