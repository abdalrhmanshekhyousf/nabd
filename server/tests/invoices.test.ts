import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { addCharge } from '../src/services/charge.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function books() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const accountant = await createUser(id, {
    email: `acc-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'ACCOUNTANT',
  });
  const auth = {
    Authorization: `Bearer ${signAccessToken({ sub: accountant.id, hospitalId: id, role: 'ACCOUNTANT' })}`,
  };
  const db = forHospital(id);
  const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'سارة' } });
  const charge = (kind: 'VISIT' | 'LAB_TEST', sourceId: string) =>
    addCharge(db, { hospitalId: id, patientId: patient.id, kind, description: kind, sourceId });
  return { id, auth, patient, charge };
}

describe('invoices (task 4.13)', () => {
  it('lists open accounts, issues an invoice for the open charges, numbered', async () => {
    const b = await books();
    await b.charge('VISIT', 'v1');
    await b.charge('LAB_TEST', 't1');
    const accounts = (await request(app).get('/api/invoices/accounts').set(b.auth)).body.accounts;
    expect(accounts).toEqual([
      expect.objectContaining({
        openTotal: 75000,
        openCount: 2,
        patient: expect.objectContaining({ id: b.patient.id }),
      }),
    ]);
    const account = (await request(app).get(`/api/invoices/accounts/${b.patient.id}`).set(b.auth))
      .body;
    expect(account.open).toHaveLength(2);

    // Only the visit first.
    const visit = account.open.find((c: { kind: string }) => c.kind === 'VISIT');
    const first = await request(app)
      .post('/api/invoices')
      .set(b.auth)
      .send({ patientId: b.patient.id, itemIds: [visit.id] });
    expect(first.status).toBe(201);
    expect(first.body.invoice).toMatchObject({
      number: 1,
      total: 50000,
      status: 'ISSUED',
      paid: 0,
    });
    // Then the rest; the same charge cannot be invoiced twice.
    expect(
      (
        await request(app)
          .post('/api/invoices')
          .set(b.auth)
          .send({ patientId: b.patient.id, itemIds: [visit.id] })
      ).status,
    ).toBe(409);
    const second = await request(app)
      .post('/api/invoices')
      .set(b.auth)
      .send({ patientId: b.patient.id });
    expect(second.body.invoice).toMatchObject({ number: 2, total: 25000 });
    expect(
      (await request(app).post('/api/invoices').set(b.auth).send({ patientId: b.patient.id }))
        .status,
    ).toBe(409);
    const after = (await request(app).get(`/api/invoices/accounts/${b.patient.id}`).set(b.auth))
      .body;
    expect(after.open).toEqual([]);
    expect(after.invoices.map((i: { number: number }) => i.number)).toEqual([2, 1]);
    const one = (await request(app).get(`/api/invoices/${first.body.invoice.id}`).set(b.auth)).body;
    expect(one.invoice.items[0].kind).toBe('VISIT');
  });

  it('issuing at once gives different numbers', async () => {
    const b = await books();
    await b.charge('VISIT', 'v1');
    await b.charge('LAB_TEST', 't1');
    const account = (await request(app).get(`/api/invoices/accounts/${b.patient.id}`).set(b.auth))
      .body;
    const results = await Promise.all(
      account.open.map((charge: { id: string }) =>
        request(app)
          .post('/api/invoices')
          .set(b.auth)
          .send({ patientId: b.patient.id, itemIds: [charge.id] }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results.map((r) => r.body.invoice.number).sort()).toEqual([1, 2]);
  });

  it('is for the accountant and the admin', async () => {
    const b = await books();
    const nurse = await createUser(b.id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: nurse.id, hospitalId: b.id, role: 'NURSE' })}`,
    };
    expect((await request(app).get('/api/invoices/accounts').set(auth)).status).toBe(403);
  });
});

describe('payments (task 4.14)', () => {
  it('a part, then the rest: the invoice moves to partly paid, then paid; never more than due', async () => {
    const b = await books();
    await b.charge('VISIT', 'v1');
    const invoice = (
      await request(app).post('/api/invoices').set(b.auth).send({ patientId: b.patient.id })
    ).body.invoice;
    const pay = (body: object) =>
      request(app)
        .post('/api/invoices/' + invoice.id + '/payments')
        .set(b.auth)
        .send(body);
    expect((await pay({ amount: 60000, method: 'CASH' })).status).toBe(400);
    const part = await pay({ amount: 20000, method: 'CASH', note: 'دفعة أولى' });
    expect(part.body.invoice).toMatchObject({ status: 'PARTIALLY_PAID', paid: 20000 });
    const owed = (await request(app).get('/api/invoices').set(b.auth)).body.invoices;
    expect(owed.map((i: { id: string }) => i.id)).toEqual([invoice.id]);
    const rest = await pay({ amount: 30000, method: 'CARD' });
    expect(rest.body.invoice).toMatchObject({ status: 'PAID', paid: 50000 });
    expect(rest.body.invoice.payments.map((p: { method: string }) => p.method)).toEqual([
      'CASH',
      'CARD',
    ]);
    expect((await pay({ amount: 1, method: 'CASH' })).status).toBe(409);
    expect((await request(app).get('/api/invoices').set(b.auth)).body.invoices).toEqual([]);
    expect(
      (await request(app).get('/api/invoices?status=PAID').set(b.auth)).body.invoices,
    ).toHaveLength(1);
  });

  it('two payments at once cannot both take the last amount', async () => {
    const b = await books();
    await b.charge('VISIT', 'v1');
    const invoice = (
      await request(app).post('/api/invoices').set(b.auth).send({ patientId: b.patient.id })
    ).body.invoice;
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post('/api/invoices/' + invoice.id + '/payments')
          .set(b.auth)
          .send({ amount: 50000, method: 'CASH' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });
});

describe('my invoices (task 4.15)', () => {
  it('the patient sees their invoices and what is not invoiced yet; only their own', async () => {
    const b = await books();
    const user = await createUser(b.id, {
      email: 'p-' + crypto.randomUUID() + '@nabd.test',
      password: 'x',
      role: 'PATIENT',
    });
    await prisma.patient.update({ where: { id: b.patient.id }, data: { userId: user.id } });
    const mine = {
      Authorization:
        'Bearer ' + signAccessToken({ sub: user.id, hospitalId: b.id, role: 'PATIENT' }),
    };
    await b.charge('VISIT', 'v1');
    await request(app).post('/api/invoices').set(b.auth).send({ patientId: b.patient.id });
    await b.charge('LAB_TEST', 't1');
    const res = (await request(app).get('/api/patients/me/invoices').set(mine)).body;
    expect(res.invoices.map((i: { number: number; total: number }) => [i.number, i.total])).toEqual(
      [[1, 50000]],
    );
    expect(res.open.map((c: { kind: string }) => c.kind)).toEqual(['LAB_TEST']);
    const other = await prisma.patient.create({ data: { hospitalId: b.id, fullName: 'x' } });
    const otherUser = await createUser(b.id, {
      email: 'o-' + crypto.randomUUID() + '@nabd.test',
      password: 'x',
      role: 'PATIENT',
    });
    await prisma.patient.update({ where: { id: other.id }, data: { userId: otherUser.id } });
    const theirs = {
      Authorization:
        'Bearer ' + signAccessToken({ sub: otherUser.id, hospitalId: b.id, role: 'PATIENT' }),
    };
    expect((await request(app).get('/api/patients/me/invoices').set(theirs)).body).toEqual({
      invoices: [],
      open: [],
    });
  });
});
