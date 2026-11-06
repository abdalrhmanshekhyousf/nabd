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

type Role = 'ADMIN' | 'PHARMACIST' | 'LAB_TECHNICIAN';

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
      add: (body: object, query: Record<string, string> = {}) =>
        request(app)
          .post('/api/inventory')
          .query(query)
          .set(auth)
          .send({ notes: null, ...body }),
      edit: (itemId: string, body: object) =>
        request(app)
          .patch(`/api/inventory/${itemId}`)
          .set(auth)
          .send({ notes: null, ...body }),
      move: (itemId: string, body: object, query: Record<string, string> = {}) =>
        request(app)
          .post(`/api/inventory/${itemId}/movements`)
          .query(query)
          .set(auth)
          .send({ reason: null, ...body }),
      notices: () =>
        prisma.notification.findMany({ where: { userId: user.id, type: 'LOW_STOCK' } }),
    };
  }
  return { id, person };
}

describe('low-stock alerts (task 3.3)', () => {
  it('reaching the minimum tells the other pharmacists, once, with where to look', async () => {
    const h = await hospital();
    const rami = await h.person('PHARMACIST', 'رامي');
    const huda = await h.person('PHARMACIST', 'هدى');
    const lab = await h.person('LAB_TECHNICIAN', 'هبة');
    const item = (
      await rami.add({ name: 'سيفترياكسون 1 غ فيال', unit: 'فيال', quantity: 45, minQuantity: 40 })
    ).body.item;

    expect((await rami.move(item.id, { kind: 'USE', amount: 3 })).body.becameLow).toBe(false);
    expect(await huda.notices()).toEqual([]);
    expect((await rami.move(item.id, { kind: 'USE', amount: 2 })).body.becameLow).toBe(true);

    expect(await huda.notices()).toEqual([
      expect.objectContaining({
        urgent: false,
        data: { item: 'سيفترياكسون 1 غ فيال', quantity: 40, unit: 'فيال', min: 40 },
        link: '/pharmacy/inventory',
      }),
    ]);
    // The one who moved it sees it on their screen; the lab is not concerned.
    expect(await rami.notices()).toEqual([]);
    expect(await lab.notices()).toEqual([]);

    // Already low: no new alert until it is restocked and runs low again.
    await rami.move(item.id, { kind: 'USE', amount: 5 });
    expect(await huda.notices()).toHaveLength(1);
    await rami.move(item.id, { kind: 'RESTOCK', amount: 100 });
    await rami.move(item.id, { kind: 'ADJUST', counted: 10, reason: 'جرد' });
    expect(await huda.notices()).toHaveLength(2);
  });

  it('an item added under its minimum, or a raised minimum, alerts too', async () => {
    const h = await hospital();
    const rami = await h.person('PHARMACIST', 'رامي');
    const huda = await h.person('PHARMACIST', 'هدى');

    await rami.add({ name: 'رينغر لاكتات 500 مل', unit: 'كيس', quantity: 30, minQuantity: 60 });
    expect(await huda.notices()).toHaveLength(1);
    // No real minimum: an empty item is not an alarm.
    await rami.add({ name: 'ألبومين 20%', unit: 'عبوة', quantity: 0, minQuantity: 0 });
    expect(await huda.notices()).toHaveLength(1);

    const saline = (
      await rami.add({
        name: 'سيروم ملحي 0.9% 500 مل',
        unit: 'كيس',
        quantity: 100,
        minQuantity: 80,
      })
    ).body.item;
    await rami.edit(saline.id, { name: saline.name, unit: 'كيس', minQuantity: 90 });
    expect(await huda.notices()).toHaveLength(1);
    await rami.edit(saline.id, { name: saline.name, unit: 'كيس', minQuantity: 120 });
    expect(await huda.notices()).toHaveLength(2);
  });

  it('when the admin counts the lab short, every lab technician is told', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', 'المدير');
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    const sami = await h.person('LAB_TECHNICIAN', 'سامي');
    const reagent = (
      await heba.add({ name: 'كاشف الكرياتينين', unit: 'عبوة', quantity: 10, minQuantity: 4 })
    ).body.item;

    await admin.move(
      reagent.id,
      { kind: 'ADJUST', counted: 2, reason: 'جرد' },
      { category: 'LAB' },
    );

    for (const keeper of [heba, sami]) {
      expect(await keeper.notices()).toEqual([
        expect.objectContaining({
          link: '/lab/inventory',
          data: expect.objectContaining({ quantity: 2 }),
        }),
      ]);
    }
  });
});
