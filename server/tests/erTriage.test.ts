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
      level: (visitId: string, body: object) =>
        request(app)
          .put(`/api/er/visits/${visitId}/level`)
          .set('Authorization', `Bearer ${token}`)
          .send(body),
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

describe('setting another level (task 2.14)', () => {
  it('needs a reason for another level, and the suggestion clears it', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);
    await me.triage(h.visit.id, TRIAGE); // suggested 2

    const missing = await me.level(h.visit.id, { level: 1, reason: '' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const raised = await me.level(h.visit.id, {
      level: 1,
      reason: 'ألم صدر مع تعرّق، اشتباه جلطة',
    });
    expect(raised.status).toBe(200);
    expect(raised.body.visit).toMatchObject({
      suggestedLevel: 2,
      level: 1,
      overrideReason: 'ألم صدر مع تعرّق، اشتباه جلطة',
    });

    const back = await me.level(h.visit.id, { level: 2, reason: 'أي شي' });
    expect(back.body.visit).toMatchObject({ level: 2, overrideReason: null });
  });

  it('refuses visits not assessed yet or closed, and nurses outside the ER', async () => {
    const h = await withVisit();
    const me = await h.nurse(h.er.id);
    const wardNurse = await h.nurse(h.ward.id);
    const body = { level: 1, reason: 'سبب' };

    const notAssessed = await me.level(h.visit.id, body);
    expect(notAssessed.status).toBe(409);
    expect(notAssessed.body.error.code).toBe('NOT_ASSESSED');

    await me.triage(h.visit.id, TRIAGE);
    expect((await wardNurse.level(h.visit.id, body)).status).toBe(403);
    expect((await me.level(h.visit.id, { level: 7, reason: 'x' })).status).toBe(400);

    await prisma.triageAssessment.update({
      where: { id: h.visit.id },
      data: { status: 'TRANSFERRED' },
    });
    expect((await me.level(h.visit.id, body)).body.error.code).toBe('VISIT_CLOSED');
  });
});

describe('GET /api/er/queue (task 2.15)', () => {
  it('lists open visits: untriaged first, then by level, then by arrival', async () => {
    const h = await withVisit(); // an untriaged arrival, now
    const me = await h.nurse(h.er.id);
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    const add = (chiefComplaint: string, data: object) =>
      prisma.triageAssessment.create({
        data: { hospitalId: h.id, patientId: h.visit.patientId, chiefComplaint, ...data },
      });
    await add('level 3 early', { level: 3, arrivedAt: ago(40) });
    await add('level 1', { level: 1, arrivedAt: ago(2) });
    await add('level 3 late', { level: 3, arrivedAt: ago(10) });
    await add('treated, level 2', { level: 2, arrivedAt: ago(5), status: 'IN_TREATMENT' });
    await add('discharged', { level: 1, arrivedAt: ago(60), status: 'DISCHARGED' });
    await add('transferred', { level: 1, arrivedAt: ago(60), status: 'TRANSFERRED' });

    const res = await request(app)
      .get('/api/er/queue')
      .set(
        'Authorization',
        `Bearer ${signAccessToken({ sub: me.id, hospitalId: h.id, role: 'NURSE' })}`,
      );

    expect(res.status).toBe(200);
    expect(res.body.visits.map((v: { chiefComplaint: string }) => v.chiefComplaint)).toEqual([
      'غياب وعي',
      'level 1',
      'treated, level 2',
      'level 3 early',
      'level 3 late',
    ]);
  });

  it('is for emergency nurses of this hospital only', async () => {
    const h = await withVisit();
    const other = await withVisit();
    const wardNurse = await h.nurse(h.ward.id);
    const otherNurse = await other.nurse(other.er.id);
    const get = (user: { id: string }, hospitalId: string) =>
      request(app)
        .get('/api/er/queue')
        .set(
          'Authorization',
          `Bearer ${signAccessToken({ sub: user.id, hospitalId, role: 'NURSE' })}`,
        );

    expect((await get(wardNurse, h.id)).status).toBe(403);
    const theirs = (await get(otherNurse, other.id)).body.visits;
    expect(theirs.map((v: { id: string }) => v.id)).toEqual([other.visit.id]);
  });
});
