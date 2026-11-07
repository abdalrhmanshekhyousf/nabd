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

async function clinic() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function doctor(fullName: string) {
    const user = await createUser(id, {
      email: `d-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: `مريض ${fullName}`,
        medicalRecord: { create: { hospitalId: id, doctorId: user.id } },
      },
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'DOCTOR' })}`,
    };
    return {
      ...user,
      patient,
      order: (patientId: string, body: object) =>
        request(app)
          .post(`/api/doctors/me/patients/${patientId}/lab-tests`)
          .set(auth)
          .send({ notes: null, priority: 'ROUTINE', ...body }),
      cancel: (testId: string) =>
        request(app).delete(`/api/doctors/me/lab-tests/${testId}`).set(auth),
      file: (patientId: string) =>
        request(app).get(`/api/doctors/me/patients/${patientId}`).set(auth),
    };
  }
  return { id, doctor };
}

describe('lab test orders (task 3.4)', () => {
  it('a doctor orders tests for their patient; each is its own line in the file', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');

    const res = await sami.order(sami.patient.id, {
      codes: ['CBC', 'CRP', 'TROPONIN'],
      priority: 'URGENT',
      notes: 'ألم صدري منذ ساعتين',
    });

    expect(res.status).toBe(201);
    expect(res.body.tests).toHaveLength(3);
    expect(res.body.tests[0]).toMatchObject({
      priority: 'URGENT',
      status: 'REQUESTED',
      doctorName: 'د. سامي',
      notes: 'ألم صدري منذ ساعتين',
      result: null,
      hasResultFile: false,
    });
    const file = (await sami.file(sami.patient.id)).body;
    expect(file.labTests.map((t: { code: string }) => t.code).sort()).toEqual([
      'CBC',
      'CRP',
      'TROPONIN',
    ]);
  });

  it('refuses another doctor’s patient, unknown tests and an empty order', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');

    expect((await nour.order(sami.patient.id, { codes: ['CBC'] })).status).toBe(404);
    expect((await sami.order(sami.patient.id, { codes: ['MAGIC'] })).status).toBe(400);
    expect((await sami.order(sami.patient.id, { codes: [] })).status).toBe(400);
    expect(await prisma.labTest.count({ where: { hospitalId: h.id } })).toBe(0);
  });

  it('the doctor withdraws a test until the lab starts on it', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    const [cbc, urea] = (await sami.order(sami.patient.id, { codes: ['CBC', 'UREA'] })).body.tests;

    expect((await nour.cancel(cbc.id)).status).toBe(404);
    expect((await sami.cancel(cbc.id)).body.test.status).toBe('CANCELLED');
    await prisma.labTest.update({ where: { id: urea.id }, data: { status: 'IN_PROGRESS' } });
    expect((await sami.cancel(urea.id)).status).toBe(409);
    expect((await sami.cancel(cbc.id)).status).toBe(409);
  });

  it('the test stays in the file, signed, if the doctor’s account goes', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const [test] = (await sami.order(sami.patient.id, { codes: ['HBA1C'] })).body.tests;

    await prisma.user.delete({ where: { id: sami.id } });

    expect(await prisma.labTest.findUnique({ where: { id: test.id } })).toMatchObject({
      doctorId: null,
      doctorName: 'د. سامي',
      code: 'HBA1C',
    });
  });
});
