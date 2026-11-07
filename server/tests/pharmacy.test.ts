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
  async function person(role: 'PHARMACIST' | 'DOCTOR' | 'NURSE', fullName: string) {
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
      auth,
      board: () => request(app).get('/api/pharmacy/prescriptions').set(auth),
      dispense: (prescriptionId: string, lines: object[]) =>
        request(app)
          .post(`/api/pharmacy/prescriptions/${prescriptionId}/dispense`)
          .set(auth)
          .send({ lines }),
    };
  }
  const doctor = await person('DOCTOR', 'د. سامي');
  const patient = await prisma.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة',
      medicalRecord: { create: { hospitalId: id, doctorId: doctor.id, allergies: 'البنسلين' } },
    },
    include: { medicalRecord: true },
  });
  const stock = (name: string, quantity: number, minQuantity = 5) =>
    prisma.inventoryItem.create({
      data: { hospitalId: id, category: 'DRUG', name, unit: 'علبة', quantity, minQuantity },
    });
  const prescribe = (items: { drugName: string; dose: string }[]) =>
    prisma.prescription.create({
      data: {
        hospitalId: id,
        recordId: patient.medicalRecord!.id,
        doctorId: doctor.id,
        doctorName: 'د. سامي',
        items: {
          create: items.map((item) => ({ hospitalId: id, frequency: 'مرة باليوم', ...item })),
        },
      },
      include: { items: true },
    });
  return { id, person, doctor, patient, stock, prescribe };
}

const quantityOf = async (id: string) =>
  (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity;

describe('pharmacy board and dispensing (task 3.10)', () => {
  it('lists waiting prescriptions with the allergies and stock matched to each medicine', async () => {
    const h = await pharmacy();
    const rami = await h.person('PHARMACIST', 'رامي');
    const amlo10 = await h.stock('أملوديبين 10 ملغ مضغوطات', 60);
    const amlo5 = await h.stock('أملوديبين 5 ملغ مضغوطات', 20);
    await h.stock('أسبرين 81 ملغ مضغوطات', 40);
    await h.prescribe([{ drugName: 'أملوديبين', dose: '5 ملغ' }]);

    const [prescription] = (await rami.board()).body.prescriptions;

    expect(prescription).toMatchObject({
      status: 'PENDING',
      doctorName: 'د. سامي',
      allergies: 'البنسلين',
      patient: { fullName: 'سارة' },
    });
    // The dose's strength first, then what is on the shelf.
    expect(prescription.items[0].matches.map((m: { id: string }) => m.id)).toEqual([
      amlo5.id,
      amlo10.id,
    ]);
    expect((await h.doctor.board()).status).toBe(403);
  });

  it('dispensing takes the medicines out of stock and records them in the file', async () => {
    const h = await pharmacy();
    const rami = await h.person('PHARMACIST', 'رامي');
    const amlo = await h.stock('أملوديبين 5 ملغ مضغوطات', 20);
    const prescription = await h.prescribe([
      { drugName: 'أملوديبين', dose: '5 ملغ' },
      { drugName: 'دواء غير متوفر', dose: '1 حبة' },
    ]);
    const [first, second] = prescription.items;

    const res = await rami.dispense(prescription.id, [
      { prescriptionItemId: first.id, inventoryItemId: amlo.id, quantity: 2 },
      { prescriptionItemId: second.id, inventoryItemId: null, quantity: 0 },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.prescription).toMatchObject({ status: 'DISPENSED', dispensedByName: 'رامي' });
    expect(await quantityOf(amlo.id)).toBe(18);
    expect(
      await prisma.stockMovement.findFirst({ where: { itemId: amlo.id, kind: 'DISPENSE' } }),
    ).toMatchObject({ change: -2, prescriptionItemId: first.id, reason: 'سارة', byName: 'رامي' });
    const file = (
      await request(app).get(`/api/doctors/me/patients/${h.patient.id}`).set(h.doctor.auth)
    ).body.prescriptions[0];
    expect(file).toMatchObject({ status: 'DISPENSED', dispensedByName: 'رامي' });
    const dispensed = Object.fromEntries(
      file.items.map((i: { drugName: string; dispensed: unknown }) => [i.drugName, i.dispensed]),
    );
    expect(dispensed).toEqual({
      أملوديبين: { quantity: 2, name: 'أملوديبين 5 ملغ مضغوطات', unit: 'علبة' },
      'دواء غير متوفر': null,
    });
  });

  it('all or nothing: one medicine short and nothing is taken', async () => {
    const h = await pharmacy();
    const rami = await h.person('PHARMACIST', 'رامي');
    const plenty = await h.stock('أسبرين 81 ملغ مضغوطات', 40);
    const scarce = await h.stock('كلوبيدوغريل 75 ملغ مضغوطات', 1);
    const prescription = await h.prescribe([
      { drugName: 'أسبرين', dose: '81 ملغ' },
      { drugName: 'كلوبيدوغريل', dose: '75 ملغ' },
    ]);
    const [a, b] = prescription.items;

    const res = await rami.dispense(prescription.id, [
      { prescriptionItemId: a.id, inventoryItemId: plenty.id, quantity: 1 },
      { prescriptionItemId: b.id, inventoryItemId: scarce.id, quantity: 3 },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
    expect(await quantityOf(plenty.id)).toBe(40);
    expect(
      (await prisma.prescription.findUniqueOrThrow({ where: { id: prescription.id } })).status,
    ).toBe('PENDING');
  });

  it('two pharmacists at once: one dispenses, the other is told; every medicine must be answered', async () => {
    const h = await pharmacy();
    const rami = await h.person('PHARMACIST', 'رامي');
    const huda = await h.person('PHARMACIST', 'هدى');
    const amlo = await h.stock('أملوديبين 5 ملغ مضغوطات', 20);
    const prescription = await h.prescribe([
      { drugName: 'أملوديبين', dose: '5 ملغ' },
      { drugName: 'أسبرين', dose: '81 ملغ' },
    ]);
    const [first, second] = prescription.items;

    expect(
      (
        await rami.dispense(prescription.id, [
          { prescriptionItemId: first.id, inventoryItemId: amlo.id, quantity: 1 },
        ])
      ).status,
    ).toBe(400);
    const lines = [
      { prescriptionItemId: first.id, inventoryItemId: amlo.id, quantity: 1 },
      { prescriptionItemId: second.id, inventoryItemId: null, quantity: 0 },
    ];
    const results = await Promise.all([
      rami.dispense(prescription.id, lines),
      huda.dispense(prescription.id, lines),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await quantityOf(amlo.id)).toBe(19);
  });

  it('a medicine that reaches its minimum alerts the other pharmacists', async () => {
    const h = await pharmacy();
    const rami = await h.person('PHARMACIST', 'رامي');
    const huda = await h.person('PHARMACIST', 'هدى');
    const scarce = await h.stock('إينوكسابارين 40 ملغ محقنة جاهزة', 7, 5);
    const prescription = await h.prescribe([{ drugName: 'إينوكسابارين', dose: '40 ملغ' }]);

    const res = await rami.dispense(prescription.id, [
      { prescriptionItemId: prescription.items[0].id, inventoryItemId: scarce.id, quantity: 2 },
    ]);

    expect(res.body.lowItems).toEqual(['إينوكسابارين 40 ملغ محقنة جاهزة']);
    expect(
      await prisma.notification.findMany({ where: { userId: huda.id, type: 'LOW_STOCK' } }),
    ).toHaveLength(1);
  });
});
