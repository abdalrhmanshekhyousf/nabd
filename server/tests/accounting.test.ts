import { DEFAULT_PRICES } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { addCharge, chargeStay, dropCharge, priceOf } from '../src/services/charge.service.js';
import { prisma } from '../src/lib/prisma.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();

const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('accounting tables (task 4.11)', () => {
  it('a charge is added once per source; an invoice takes it and is paid', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'سارة' } });
    const charge = {
      hospitalId: id,
      patientId: patient.id,
      kind: 'LAB_TEST' as const,
      description: 'CBC',
      unitPrice: 15000,
      total: 15000,
      sourceId: 'lab-1',
    };
    const item = await prisma.invoiceItem.create({ data: charge });
    await expect(prisma.invoiceItem.create({ data: charge })).rejects.toMatchObject({
      code: 'P2002',
    });

    const invoice = await prisma.invoice.create({
      data: { hospitalId: id, patientId: patient.id, number: 1, total: 15000 },
    });
    await prisma.invoiceItem.update({ where: { id: item.id }, data: { invoiceId: invoice.id } });
    await prisma.payment.create({
      data: { hospitalId: id, invoiceId: invoice.id, amount: 15000, method: 'CASH' },
    });
    const full = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { items: true, payments: true },
    });
    expect(full.items).toHaveLength(1);
    expect(Number(full.payments[0]!.amount)).toBe(15000);
    // Numbers are unique in a hospital.
    await expect(
      prisma.invoice.create({
        data: { hospitalId: id, patientId: patient.id, number: 1, total: 0 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('services charged to the patient (task 4.12)', () => {
  it('charges at the price list: exact, then the kind’s default, then built-in; once per source', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const db = forHospital(id);
    const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'سارة' } });
    // Built-in default.
    expect(await priceOf(db, 'LAB_TEST', 'CBC')).toBe(DEFAULT_PRICES.LAB_TEST);
    await prisma.servicePrice.create({
      data: { hospitalId: id, kind: 'LAB_TEST', code: '', name: 'تحليل', price: 20000 },
    });
    expect(await priceOf(db, 'LAB_TEST', 'CBC')).toBe(20000);
    await prisma.servicePrice.create({
      data: { hospitalId: id, kind: 'LAB_TEST', code: 'CBC', name: 'CBC', price: 12000 },
    });
    expect(await priceOf(db, 'LAB_TEST', 'CBC')).toBe(12000);

    const charge = {
      hospitalId: id,
      patientId: patient.id,
      kind: 'LAB_TEST' as const,
      code: 'CBC',
      description: 'CBC',
      sourceId: 'test-1',
    };
    expect(await addCharge(db, charge)).toBe(true);
    expect(await addCharge(db, charge)).toBe(false);
    expect(
      await addCharge(db, { ...charge, kind: 'BED_DAY', quantity: 3, sourceId: 'stay-1' }),
    ).toBe(true);
    const items = await prisma.invoiceItem.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(items.map((i) => [i.kind, Number(i.total)])).toEqual([
      ['LAB_TEST', 12000],
      ['BED_DAY', DEFAULT_PRICES.BED_DAY * 3],
    ]);
    // A cancelled visit's charge goes, unless invoiced.
    await addCharge(db, { ...charge, kind: 'VISIT', sourceId: 'visit-1' });
    await dropCharge(db, 'VISIT', 'visit-1');
    expect(await prisma.invoiceItem.count({ where: { kind: 'VISIT' } })).toBe(0);
  });

  it('a discharged stay counts every started day', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const db = forHospital(id);
    const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'عمر' } });
    const dept = await prisma.department.create({ data: { hospitalId: id, name: 'د' } });
    const room = await prisma.room.create({
      data: { hospitalId: id, departmentId: dept.id, number: '1' },
    });
    const bed = await prisma.bed.create({ data: { hospitalId: id, roomId: room.id, label: '1' } });
    const admittedAt = new Date(Date.now() - 2.5 * 86_400_000);
    const stay = await prisma.bedAssignment.create({
      data: {
        hospitalId: id,
        bedId: bed.id,
        patientId: patient.id,
        admittedAt,
        dischargedAt: new Date(),
        admittedByName: 'x',
      },
    });
    await chargeStay(db, id, stay.id);
    const [item] = await prisma.invoiceItem.findMany({ where: { patientId: patient.id } });
    expect(item).toMatchObject({ kind: 'BED_DAY', quantity: 3 });
  });

  it('the price list is the accountant’s and the admin’s', async () => {
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
    const put = await request(app)
      .put('/api/prices')
      .set(auth)
      .send({ kind: 'VISIT', name: 'معاينة', price: 60000 });
    expect(put.body.price).toMatchObject({ kind: 'VISIT', code: '', price: 60000 });
    const again = await request(app)
      .put('/api/prices')
      .set(auth)
      .send({ kind: 'VISIT', name: 'معاينة', price: 65000 });
    expect(again.body.price.id).toBe(put.body.price.id);
    const list = (await request(app).get('/api/prices').set(auth)).body;
    expect(list.prices).toHaveLength(1);
    expect(list.defaults.VISIT).toBe(DEFAULT_PRICES.VISIT);
    expect((await request(app).delete(`/api/prices/${put.body.price.id}`).set(auth)).status).toBe(
      204,
    );
  });
});
