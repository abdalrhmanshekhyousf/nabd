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

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: 'ADMIN' | 'PHARMACIST' | 'LAB_TECHNICIAN', fullName: string) {
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
      preview: (from: Date, to: Date) =>
        request(app)
          .get('/api/reports/preview')
          .query({ from: from.toISOString(), to: to.toISOString() })
          .set(auth),
      submit: (body: object) => request(app).post('/api/reports').set(auth).send(body),
      list: () => request(app).get('/api/reports').set(auth),
      open: (reportId: string) => request(app).get(`/api/reports/${reportId}`).set(auth),
    };
  }
  const rami = await person('PHARMACIST', 'رامي');
  const record = (
    await prisma.patient.create({
      data: { hospitalId: id, fullName: 'سارة', medicalRecord: { create: { hospitalId: id } } },
      include: { medicalRecord: true },
    })
  ).medicalRecord!;
  const item = (name: string, quantity: number, minQuantity: number) =>
    prisma.inventoryItem.create({
      data: { hospitalId: id, category: 'DRUG', name, unit: 'علبة', quantity, minQuantity },
    });
  const movement = (itemId: string, kind: 'DISPENSE' | 'RESTOCK', change: number, at: Date) =>
    prisma.stockMovement.create({
      data: {
        hospitalId: id,
        itemId,
        kind,
        change,
        quantityAfter: 10,
        byName: 'رامي',
        createdAt: at,
      },
    });
  const prescription = (dispensedAt: Date | null, drugs: { name: string; given: boolean }[]) =>
    prisma.prescription.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorName: 'د. سامي',
        status: dispensedAt ? 'DISPENSED' : 'PENDING',
        dispensedAt,
        items: {
          create: drugs.map(({ name, given }) => ({
            hospitalId: id,
            drugName: name,
            dose: '1',
            frequency: 'مرة',
            dispensedQuantity: given ? 1 : null,
          })),
        },
      },
    });
  return { id, person, rami, item, movement, prescription };
}

describe('pharmacy report (task 3.11)', () => {
  it('works out the period’s figures: dispensed, missing, received and running low', async () => {
    const h = await hospital();
    const amlo = await h.item('أملوديبين 5 ملغ', 3, 20);
    const aspirin = await h.item('أسبرين 81 ملغ', 0, 10);
    await h.item('سيروم ملحي', 200, 50);
    await h.movement(amlo.id, 'DISPENSE', -4, days(-2));
    await h.movement(amlo.id, 'DISPENSE', -2, days(-1));
    await h.movement(aspirin.id, 'DISPENSE', -1, days(-1));
    await h.movement(amlo.id, 'RESTOCK', 30, days(-3));
    await h.movement(amlo.id, 'DISPENSE', -9, days(-40)); // before the period
    await h.prescription(days(-1), [
      { name: 'أملوديبين', given: true },
      { name: 'ريفاروكسابان', given: false },
    ]);
    await h.prescription(days(-2), [{ name: 'ريفاروكسابان', given: false }]);
    await h.prescription(days(-1), [{ name: 'أسبرين', given: true }]);
    await h.prescription(null, [{ name: 'أسبرين', given: false }]);

    const { data } = (await h.rami.preview(days(-7), days(0))).body;

    expect(data.prescriptions).toEqual({ dispensed: 3, withMissing: 2, waiting: 1 });
    expect(data.dispensed).toEqual([
      { name: 'أملوديبين 5 ملغ', unit: 'علبة', quantity: 6 },
      { name: 'أسبرين 81 ملغ', unit: 'علبة', quantity: 1 },
    ]);
    expect(data.received).toEqual([{ name: 'أملوديبين 5 ملغ', unit: 'علبة', quantity: 30 }]);
    expect(data.unavailable).toEqual([{ drugName: 'ريفاروكسابان', times: 2 }]);
    expect(data.low.map((i: { name: string }) => i.name)).toEqual([
      'أسبرين 81 ملغ',
      'أملوديبين 5 ملغ',
    ]);
    expect(data.outOfStock).toBe(1);
  });

  it('sending keeps the figures as they were and tells the admins; the admin reads it', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', 'المدير');
    const amlo = await h.item('أملوديبين 5 ملغ', 50, 20);
    await h.movement(amlo.id, 'DISPENSE', -5, days(-1));

    const sent = await h.rami.submit({
      kind: 'PHARMACY',
      from: days(-7).toISOString(),
      to: days(0).toISOString(),
      notes: 'نحتاج طلبية أملوديبين قبل آخر الشهر',
      // The pharmacist corrected the missing medicines by hand.
      unavailable: [{ drugName: 'إنسولين غلارجين', times: 4 }],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.report).toMatchObject({
      kind: 'PHARMACY',
      authorName: 'رامي',
      notes: 'نحتاج طلبية أملوديبين قبل آخر الشهر',
      readAt: null,
    });
    // Later movements do not change a sent report.
    await h.movement(amlo.id, 'DISPENSE', -20, days(-1));
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: admin.id } });
    expect(notice).toMatchObject({
      type: 'REPORT_SUBMITTED',
      data: { kind: 'PHARMACY', author: 'رامي' },
      link: `/admin/reports?open=${sent.body.report.id}`,
    });

    expect((await admin.list()).body.reports).toHaveLength(1);
    const opened = (await admin.open(sent.body.report.id)).body.report;
    expect(opened.data.dispensed).toEqual([{ name: 'أملوديبين 5 ملغ', unit: 'علبة', quantity: 5 }]);
    expect(opened.data.unavailable).toEqual([{ drugName: 'إنسولين غلارجين', times: 4 }]);
    expect(opened.readAt).not.toBeNull();
    expect((await h.rami.list()).body.reports[0].readAt).not.toBeNull();
  });

  it('only those who write a report send it; a wrong period is refused', async () => {
    const h = await hospital();
    const lab = await h.person('LAB_TECHNICIAN', 'هبة');
    const admin = await h.person('ADMIN', 'المدير');
    const period = { from: days(-7).toISOString(), to: days(0).toISOString() };

    expect((await lab.list()).status).toBe(403);
    expect((await admin.submit({ kind: 'PHARMACY', ...period, notes: null })).status).toBe(403);
    expect(
      (await h.rami.submit({ kind: 'PHARMACY', from: period.to, to: period.from, notes: null }))
        .status,
    ).toBe(400);
    expect((await h.rami.preview(days(-800), days(0))).status).toBe(400);
  });
});
