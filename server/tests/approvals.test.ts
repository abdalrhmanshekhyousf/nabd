import { addLocalDays, zonedDate } from '@nabd/shared';
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

const today = zonedDate(new Date());

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const ward = await prisma.department.create({
    data: { hospitalId: id, name: 'الداخلية', code: 'INTERNAL_MEDICINE' },
  });
  const person = async (role: string, departmentId: string | null = ward.id) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: role as never,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { fullName: `${role} ${user.id.slice(-4)}` },
    });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: role as never })}`,
    };
    return { id: user.id, auth };
  };
  return { id, ward, person };
}

describe('the admin decides requests (task 4.7)', () => {
  it('approves a leave: the requester and the head of their department are told', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', null);
    const head = await h.person('DOCTOR');
    const nurse = await h.person('NURSE');
    await prisma.department.update({ where: { id: h.ward.id }, data: { headId: head.id } });
    const from = addLocalDays(today, 2);
    const to = addLocalDays(today, 3);
    const asked = (
      await request(app).post('/api/leave').set(nurse.auth).send({ from, to, reason: 'سفر' })
    ).body.request;

    const pending = (await request(app).get('/api/approvals').set(admin.auth)).body;
    expect(pending.leave.map((l: { id: string }) => l.id)).toEqual([asked.id]);
    expect(pending.leave[0].requester.department.code).toBe('INTERNAL_MEDICINE');

    const decided = await request(app)
      .post(`/api/approvals/leave/${asked.id}`)
      .set(admin.auth)
      .send({ decision: 'APPROVED', note: null });
    expect(decided.body.request).toMatchObject({ status: 'APPROVED' });
    expect(
      (await prisma.notification.findMany({ where: { userId: nurse.id } })).map((n) => n.type),
    ).toEqual(['REQUEST_DECIDED']);
    const away = await prisma.notification.findMany({ where: { userId: head.id } });
    expect(away.map((n) => [n.type, n.data])).toEqual([
      ['STAFF_AWAY', { name: `NURSE ${nurse.id.slice(-4)}`, from, to }],
    ]);
    // Once only.
    const again = await request(app)
      .post(`/api/approvals/leave/${asked.id}`)
      .set(admin.auth)
      .send({ decision: 'REJECTED', note: 'x' });
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
    expect((await request(app).get('/api/approvals').set(admin.auth)).body.leave).toEqual([]);
    const done = (await request(app).get('/api/approvals?status=DECIDED').set(admin.auth)).body;
    expect(done.leave.map((l: { id: string }) => l.id)).toEqual([asked.id]);
  });

  it('a rejection says why; purchases and repairs are decided too', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', null);
    const head = await h.person('DOCTOR');
    await prisma.department.update({ where: { id: h.ward.id }, data: { headId: head.id } });
    const purchase = (
      await request(app)
        .post('/api/department-requests/purchases')
        .set(head.auth)
        .send({ items: [{ name: 'شاش', quantity: 5, unitCost: 1000 }], note: null })
    ).body.request;
    const repair = (
      await request(app)
        .post('/api/department-requests/repairs')
        .set(head.auth)
        .send({ equipment: 'جهاز ضغط', description: 'ما عم يقيس', urgency: 'LOW' })
    ).body.request;

    const noReason = await request(app)
      .post(`/api/approvals/purchase/${purchase.id}`)
      .set(admin.auth)
      .send({ decision: 'REJECTED' });
    expect(noReason.status).toBe(400);
    const rejected = await request(app)
      .post(`/api/approvals/purchase/${purchase.id}`)
      .set(admin.auth)
      .send({ decision: 'REJECTED', note: 'الميزانية خلصت هالشهر' });
    expect(rejected.body.request).toMatchObject({
      status: 'REJECTED',
      decisionNote: 'الميزانية خلصت هالشهر',
    });
    const fixed = await request(app)
      .post(`/api/approvals/repair/${repair.id}`)
      .set(admin.auth)
      .send({ decision: 'APPROVED' });
    expect(fixed.body.request.status).toBe('APPROVED');
    expect(
      (await prisma.notification.findMany({ where: { userId: head.id } })).map((n) => n.type),
    ).toEqual(['REQUEST_DECIDED', 'REQUEST_DECIDED']);
    // The head sees the answers on the department's page.
    const theirs = (await request(app).get('/api/department-requests').set(head.auth)).body;
    expect(theirs.purchases[0].decisionNote).toBe('الميزانية خلصت هالشهر');
    expect(theirs.repairs[0].status).toBe('APPROVED');
  });

  it('is the admin’s alone', async () => {
    const h = await hospital();
    const doctor = await h.person('DOCTOR');
    expect((await request(app).get('/api/approvals').set(doctor.auth)).status).toBe(403);
  });
});
