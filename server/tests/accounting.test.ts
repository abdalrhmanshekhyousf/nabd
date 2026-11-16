import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createHospital } from './helpers.js';

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
