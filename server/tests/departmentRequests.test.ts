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

async function pharmacy() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const department = await prisma.department.create({
    data: { hospitalId: id, name: 'الصيدلية', code: 'PHARMACY' },
  });
  const person = async (role: string, departmentId: string | null = department.id) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: role as never,
    });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: role as never })}`,
    };
    return {
      id: user.id,
      get: (url: string) => request(app).get(`/api/department-requests${url}`).set(auth),
      post: (url: string, body: object) =>
        request(app).post(`/api/department-requests${url}`).set(auth).send(body),
      delete: (url: string) => request(app).delete(`/api/department-requests${url}`).set(auth),
    };
  };
  return { id, department, person };
}

const order = {
  items: [
    { name: 'باراسيتامول', unit: 'علبة', quantity: 10, unitCost: 2500 },
    { name: 'أموكسيسيلين', unit: 'علبة', quantity: 4, unitCost: 7000 },
  ],
  note: null,
};

describe('department requests through the head (task 4.6)', () => {
  it('only the head asks to buy; the total is computed; the department sees it', async () => {
    const h = await pharmacy();
    const admin = await h.person('ADMIN', null);
    const head = await h.person('PHARMACIST');
    const colleague = await h.person('PHARMACIST');
    await prisma.department.update({ where: { id: h.department.id }, data: { headId: head.id } });

    expect((await head.get('/context')).body).toMatchObject({ isHead: true });
    expect((await colleague.get('/context')).body).toMatchObject({
      isHead: false,
      head: { id: head.id },
    });

    expect((await colleague.post('/purchases', order)).status).toBe(403);
    const asked = await head.post('/purchases', order);
    expect(asked.status).toBe(201);
    expect(asked.body.request).toMatchObject({ totalCost: 53000, status: 'PENDING' });
    expect(asked.body.request.items).toHaveLength(2);
    const told = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(told.map((n) => n.type)).toEqual(['PURCHASE_REQUEST']);

    // The colleague sees it, but cannot withdraw it; the head can, once.
    expect((await colleague.get('/')).body.purchases).toHaveLength(1);
    expect((await colleague.delete(`/purchases/${asked.body.request.id}`)).status).toBe(403);
    expect((await head.delete(`/purchases/${asked.body.request.id}`)).status).toBe(204);
    expect((await head.delete(`/purchases/${asked.body.request.id}`)).status).toBe(409);
    expect((await head.post('/purchases', { items: [], note: null })).status).toBe(400);
  });

  it('the head reports equipment for repair, and sees what stock is short', async () => {
    const h = await pharmacy();
    const head = await h.person('PHARMACIST');
    await prisma.department.update({ where: { id: h.department.id }, data: { headId: head.id } });
    await prisma.inventoryItem.createMany({
      data: [
        {
          hospitalId: h.id,
          category: 'DRUG',
          name: 'سيتامول',
          unit: 'علبة',
          quantity: 2,
          minQuantity: 5,
        },
        {
          hospitalId: h.id,
          category: 'DRUG',
          name: 'فيتامين',
          unit: 'علبة',
          quantity: 50,
          minQuantity: 5,
        },
        {
          hospitalId: h.id,
          category: 'LAB',
          name: 'أنابيب',
          unit: 'كيس',
          quantity: 0,
          minQuantity: 5,
        },
      ],
    });
    expect((await head.get('/shortages')).body.items.map((i: { name: string }) => i.name)).toEqual([
      'سيتامول',
    ]);
    const repair = await head.post('/repairs', {
      equipment: 'براد الأدوية',
      description: 'الحرارة عم ترتفع',
      urgency: 'URGENT',
    });
    expect(repair.status).toBe(201);
    expect(repair.body.request).toMatchObject({ urgency: 'URGENT', status: 'PENDING' });
    expect((await head.get('/')).body.repairs).toHaveLength(1);
  });

  it('needs a department', async () => {
    const h = await pharmacy();
    const loose = await h.person('NURSE', null);
    expect((await loose.get('/')).status).toBe(403);
    expect((await loose.get('/context')).body).toEqual({
      department: null,
      head: null,
      isHead: false,
    });
  });
});
