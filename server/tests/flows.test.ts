// Integration tests of the core flows (task 5.1): one patient followed through
// the whole hospital, each step by the person who does it, through the API
// only, the way the screens drive it. The ER case, the lab, the pharmacy, the
// administration's approvals, and the bill.
import { addLocalDays, zonedDate } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { monthOf } from '../src/services/profit.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

const TRIAGE = {
  chiefComplaint: 'ألم بالصدر',
  breathing: true,
  consciousness: 'ALERT',
  pulse: 118,
  systolic: 90,
  diastolic: 60,
  respiratoryRate: 24,
  oxygenSaturation: 91,
  temperature: 37.8,
  painScore: 8,
  expectedExams: 2,
};

/** A small hospital with its departments and one person in each job. */
async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const department = (name: string, code: string) =>
    prisma.department.create({ data: { hospitalId: id, name, code: code as never } });
  const [er, cardio, lab, pharmacy] = await Promise.all([
    department('الإسعاف', 'EMERGENCY'),
    department('القلبية', 'CARDIOLOGY'),
    department('المخبر', 'LABORATORY'),
    department('الصيدلية', 'PHARMACY'),
  ]);
  const person = async (role: Role, fullName: string, departmentId: string | null) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (departmentId) {
      await prisma.staffProfile.create({
        data: { hospitalId: id, userId: user.id, departmentId, salary: 1_000_000 },
      });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    const as = {
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
      put: (url: string, body: object) => request(app).put(url).set(auth).send(body),
    };
    return { id: user.id, auth, ...as };
  };
  const nurse = await person('NURSE', 'لينا', er.id);
  const doctor = await person('DOCTOR', 'د. سامي', cardio.id);
  await prisma.doctorProfile.create({
    data: { hospitalId: id, userId: doctor.id, specialty: 'قلبية', status: 'AVAILABLE' },
  });
  const technician = await person('LAB_TECHNICIAN', 'رامي', lab.id);
  const pharmacist = await person('PHARMACIST', 'هبة', pharmacy.id);
  const accountant = await person('ACCOUNTANT', 'رنا', null);
  const admin = await person('ADMIN', 'المدير', null);
  return {
    id,
    er,
    cardio,
    lab,
    pharmacy,
    nurse,
    doctor,
    technician,
    pharmacist,
    accountant,
    admin,
    person,
  };
}

const notified = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
    (n) => n.type,
  );

describe('core flows end to end (task 5.1)', () => {
  it('an ER case: arrival, triage, a doctor called and accepting, tests, medicines, home, and the bill paid', async () => {
    const h = await hospital();

    // 1. The ER nurse registers the arrival and triages them.
    const arrival = await h.nurse.post('/api/er/visits', {
      anonymous: false,
      fullName: 'سارة الأحمد',
      gender: 'FEMALE',
      phone: null,
      dateOfBirth: null,
      nationalId: '11223344',
      chiefComplaint: 'ألم بالصدر',
      arrivalNote: null,
    });
    expect(arrival.status).toBe(201);
    const visitId = arrival.body.visit.id as string;
    const patientId = arrival.body.visit.patientId as string;
    const triaged = await h.nurse.put(`/api/er/visits/${visitId}/triage`, TRIAGE);
    expect(triaged.status).toBe(200);
    const suggested = triaged.body.visit.suggestedLevel as number;
    expect(suggested).toBeLessThanOrEqual(2);
    expect(
      (await h.nurse.put(`/api/er/visits/${visitId}/level`, { level: suggested, reason: null }))
        .status,
    ).toBe(200);
    // On the waiting list, most urgent first.
    const queue = (await h.nurse.get('/api/er/queue')).body.visits;
    expect(queue[0]).toMatchObject({ id: visitId });

    // 2. A doctor is called; they are told, accept, and the patient is theirs.
    const called = await h.nurse.post(`/api/er/visits/${visitId}/calls`, { doctorId: h.doctor.id });
    expect(called.status).toBe(201);
    expect(await notified(h.doctor.id)).toContain('DOCTOR_CALL');
    const calls = (await h.doctor.get('/api/doctors/me/calls')).body.pending;
    expect((await h.doctor.post(`/api/doctors/me/calls/${calls[0].id}/accept`)).status).toBe(200);
    expect(
      (await h.doctor.get('/api/doctors/me/patients')).body.patients.map(
        (p: { patientId: string }) => p.patientId,
      ),
    ).toContain(patientId);

    // 3. Lab: the doctor orders, the technician starts and records; the doctor is told and reads it.
    const ordered = await h.doctor.post(`/api/doctors/me/patients/${patientId}/lab-tests`, {
      codes: ['TROPONIN'],
      priority: 'URGENT',
      notes: null,
    });
    expect(ordered.status).toBe(201);
    const testId = ordered.body.tests[0].id as string;
    expect(
      (await h.technician.get('/api/lab-tests')).body.tests.map((t: { id: string }) => t.id),
    ).toContain(testId);
    expect((await h.technician.post(`/api/lab-tests/${testId}/start`)).status).toBe(200);
    const result = await request(app)
      .post(`/api/lab-tests/${testId}/result`)
      .set(h.technician.auth)
      .field('result', 'Troponin I: 0.02 ng/mL')
      .field('abnormal', 'false');
    expect(result.status).toBe(200);
    expect(await notified(h.doctor.id)).toContain('LAB_RESULT');
    const file = (await h.doctor.get(`/api/doctors/me/patients/${patientId}`)).body;
    expect(JSON.stringify(file)).toContain('Troponin I: 0.02 ng/mL');

    // 4. Pharmacy: the doctor prescribes, the pharmacist hands it over from stock.
    const stock = await prisma.inventoryItem.create({
      data: {
        hospitalId: h.id,
        category: 'DRUG',
        name: 'أسبرين 81 ملغ',
        unit: 'علبة',
        quantity: 6,
        minQuantity: 5,
      },
    });
    const prescribed = await h.doctor.post(`/api/doctors/me/patients/${patientId}/prescriptions`, {
      items: [
        {
          drugName: 'أسبرين',
          dose: '81 ملغ',
          frequency: 'مرة باليوم',
          durationDays: 30,
          instructions: '',
        },
      ],
      notes: null,
    });
    expect(prescribed.status).toBe(201);
    const prescription = prescribed.body.prescription;
    const dispensed = await h.pharmacist.post(
      `/api/pharmacy/prescriptions/${prescription.id}/dispense`,
      {
        lines: [
          { prescriptionItemId: prescription.items[0].id, inventoryItemId: stock.id, quantity: 2 },
        ],
      },
    );
    expect(dispensed.status).toBe(200);
    // The stock went down, and below its minimum the pharmacy was warned.
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantity,
    ).toBe(4);
    expect(dispensed.body.lowItems).toEqual(['أسبرين 81 ملغ']);

    // 5. Home from the ER.
    expect(
      (await h.nurse.post(`/api/er/visits/${visitId}/discharge`, { note: 'مراجعة بعد أسبوع' }))
        .status,
    ).toBe(200);

    // 6. The bill: every service is on the account; the accountant invoices it and takes payment.
    const account = (await h.accountant.get(`/api/invoices/accounts/${patientId}`)).body;
    expect(account.open.map((c: { kind: string }) => c.kind).sort()).toEqual([
      'DRUG',
      'LAB_TEST',
      'VISIT',
    ]);
    const total = account.open.reduce((sum: number, c: { total: number }) => sum + c.total, 0);
    const invoice = (await h.accountant.post('/api/invoices', { patientId })).body.invoice;
    expect(invoice).toMatchObject({ number: 1, total, status: 'ISSUED' });
    const paid = await h.accountant.post(`/api/invoices/${invoice.id}/payments`, {
      amount: total,
      method: 'CASH',
    });
    expect(paid.body.invoice.status).toBe('PAID');
    // And it is this month's revenue.
    const [month] = (await h.admin.get('/api/profit').query({ months: 1 })).body.months;
    expect(month).toMatchObject({ month: monthOf(new Date()), revenue: total });
  });

  it('approvals: a leave reaches the head of the department; an approved purchase is an expense', async () => {
    const h = await hospital();
    await prisma.department.update({ where: { id: h.er.id }, data: { headId: h.doctor.id } });
    // The ER's head is a doctor of the ER here.
    await prisma.staffProfile.update({
      where: { userId: h.doctor.id },
      data: { departmentId: h.er.id },
    });
    const day = addLocalDays(zonedDate(new Date()), 3);
    const leave = (await h.nurse.post('/api/leave', { from: day, to: day, reason: 'سفر' })).body
      .request;
    expect(await notified(h.admin.id)).toContain('LEAVE_REQUEST');
    expect(
      (await h.admin.post(`/api/approvals/leave/${leave.id}`, { decision: 'APPROVED' })).status,
    ).toBe(200);
    expect(await notified(h.nurse.id)).toContain('REQUEST_DECIDED');
    expect(await notified(h.doctor.id)).toContain('STAFF_AWAY');

    // The pharmacist heads the pharmacy and asks to buy; the admin approves.
    await prisma.department.update({
      where: { id: h.pharmacy.id },
      data: { headId: h.pharmacist.id },
    });
    const purchase = (
      await h.pharmacist.post('/api/department-requests/purchases', {
        items: [{ name: 'باراسيتامول', unit: 'علبة', quantity: 100, unitCost: 4_000 }],
        note: null,
      })
    ).body.request;
    expect(purchase.totalCost).toBe(400_000);
    expect(
      (await h.admin.post(`/api/approvals/purchase/${purchase.id}`, { decision: 'APPROVED' }))
        .status,
    ).toBe(200);
    const [month] = (await h.admin.get('/api/profit').query({ months: 1 })).body.months;
    expect(month.purchases).toBe(400_000);
    // Salaries of the five staff with a department.
    expect(month.salaries).toBe(4_000_000);
    expect(month.profit).toBe(-4_400_000);
  });
});
