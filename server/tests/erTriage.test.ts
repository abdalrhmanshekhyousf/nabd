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

async function withVisit() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [er, ward] = await Promise.all([
    prisma.department.create({ data: { hospitalId: id, name: 'الإسعاف', code: 'EMERGENCY' } }),
    prisma.department.create({ data: { hospitalId: id, name: 'الداخلية' } }),
  ]);
  async function nurse(departmentId: string) {
    const user = await createUser(id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    const token = signAccessToken({ sub: user.id, hospitalId: id, role: 'NURSE' });
    return {
      ...user,
      read: (visitId: string) =>
        request(app).get(`/api/er/visits/${visitId}`).set('Authorization', `Bearer ${token}`),
      triage: (visitId: string, body: object) =>
        request(app)
          .put(`/api/er/visits/${visitId}/triage`)
          .set('Authorization', `Bearer ${token}`)
          .send(body),
    };
  }
  const patient = await prisma.patient.create({
    data: { hospitalId: id, isAnonymous: true, medicalRecord: { create: { hospitalId: id } } },
  });
  const visit = await prisma.triageAssessment.create({
    data: { hospitalId: id, patientId: patient.id, chiefComplaint: 'غياب وعي' },
  });
  return { id, er, ward, nurse, visit };
}

describe('the triage form', () => {
  it('saves the assessment with the nurse and the time, and reads it back', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);

    const res = await me.triage(h.visit.id, TRIAGE);

    expect(res.status).toBe(200);
    expect(res.body.visit).toMatchObject({
      ...TRIAGE,
      status: 'WAITING',
      suggestedLevel: 2,
      level: 2,
      assessedAt: expect.any(String),
    });
    expect((await me.read(h.visit.id)).body.visit.temperature).toBe(37.8);
    expect((await prisma.triageAssessment.findUnique({ where: { id: h.visit.id } }))?.nurseId).toBe(
      me.id,
    );
  });

  it('accepts vital signs that could not be measured', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);

    const res = await me.triage(h.visit.id, {
      ...TRIAGE,
      breathing: false,
      consciousness: 'UNRESPONSIVE',
      pulse: null,
      systolic: null,
      diastolic: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.visit).toMatchObject({ breathing: false, pulse: null });
  });

  it('refuses impossible values, closed visits, and nurses outside the ER', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);
    const wardNurse = await h.nurse(h.ward.id);

    expect((await me.triage(h.visit.id, { ...TRIAGE, oxygenSaturation: 130 })).status).toBe(400);
    expect((await wardNurse.triage(h.visit.id, TRIAGE)).status).toBe(403);
    expect((await wardNurse.read(h.visit.id)).status).toBe(403);

    await prisma.triageAssessment.update({
      where: { id: h.visit.id },
      data: { status: 'DISCHARGED' },
    });
    const closed = await me.triage(h.visit.id, TRIAGE);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('VISIT_CLOSED');
  });

  it('another hospital’s visit is not found', async () => {
    const h = await withVisit();
    const other = await withVisit();
    const me = await h.nurse(h.er.id);

    expect((await me.read(other.visit.id)).status).toBe(404);
    expect((await me.triage(other.visit.id, TRIAGE)).status).toBe(404);
  });
});

describe('the suggested ESI level (task 2.13)', () => {
  const calm = {
    ...TRIAGE,
    pulse: 76,
    systolic: 120,
    diastolic: 80,
    respiratoryRate: 16,
    oxygenSaturation: 98,
    temperature: 36.8,
    painScore: 2,
    expectedExams: 0,
  };

  it('is worked out on the server and becomes the level, with its reasons', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);

    const notBreathing = (await me.triage(h.visit.id, { ...calm, breathing: false })).body.visit;
    expect(notBreathing).toMatchObject({
      suggestedLevel: 1,
      level: 1,
      reasons: [{ code: 'NOT_BREATHING' }],
    });

    const severe = (await me.triage(h.visit.id, TRIAGE)).body.visit;
    expect(severe.reasons).toEqual([
      { code: 'ABNORMAL_VITALS', signs: ['pulse', 'respiratoryRate', 'oxygenSaturation'] },
      { code: 'SEVERE_PAIN', score: 8 },
    ]);

    const minor = (await me.triage(h.visit.id, calm)).body.visit;
    expect(minor).toMatchObject({
      suggestedLevel: 5,
      level: 5,
      reasons: [{ code: 'EXAMS', count: 0 }],
    });
  });

  it('keeps a level the nurse set with a reason when the form is saved again', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);
    await prisma.triageAssessment.update({
      where: { id: h.visit.id },
      data: { level: 2, overrideReason: 'شكله تعبان أكتر من أرقامه' },
    });

    const visit = (await me.triage(h.visit.id, calm)).body.visit;

    expect(visit).toMatchObject({
      suggestedLevel: 5,
      level: 2,
      overrideReason: 'شكله تعبان أكتر من أرقامه',
    });
  });
});
