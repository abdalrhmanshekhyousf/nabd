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
          .post(`/api/doctors/me/patients/${patientId}/imaging`)
          .set(auth)
          .send({ reason: null, priority: 'ROUTINE', ...body }),
      cancel: (studyId: string) =>
        request(app).delete(`/api/doctors/me/imaging/${studyId}`).set(auth),
      file: (patientId: string) =>
        request(app).get(`/api/doctors/me/patients/${patientId}`).set(auth),
    };
  }
  return { id, doctor };
}

describe('imaging orders (task 3.6)', () => {
  it('a doctor orders a study of a modality for their patient; it shows in the file', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');

    const res = await sami.order(sami.patient.id, {
      modality: 'CT',
      bodyPart: 'رأس',
      reason: 'صداع شديد مع إقياء بعد سقوط',
      priority: 'URGENT',
    });

    expect(res.status).toBe(201);
    expect(res.body.study).toMatchObject({
      modality: 'CT',
      bodyPart: 'رأس',
      reason: 'صداع شديد مع إقياء بعد سقوط',
      priority: 'URGENT',
      status: 'REQUESTED',
      doctorName: 'د. سامي',
      imageCount: 0,
      report: null,
    });
    expect((await sami.file(sami.patient.id)).body.imaging).toEqual([
      expect.objectContaining({ id: res.body.study.id, modality: 'CT' }),
    ]);
  });

  it('refuses another doctor’s patient, an unknown modality and a missing body part', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');

    expect((await nour.order(sami.patient.id, { modality: 'XRAY', bodyPart: 'صدر' })).status).toBe(
      404,
    );
    expect((await sami.order(sami.patient.id, { modality: 'PET', bodyPart: 'صدر' })).status).toBe(
      400,
    );
    expect((await sami.order(sami.patient.id, { modality: 'XRAY', bodyPart: '' })).status).toBe(
      400,
    );
    expect(await prisma.radiologyImage.count({ where: { hospitalId: h.id } })).toBe(0);
  });

  it('the doctor withdraws a study until radiology starts on it', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    const chest = (await sami.order(sami.patient.id, { modality: 'XRAY', bodyPart: 'صدر' })).body
      .study;
    const knee = (await sami.order(sami.patient.id, { modality: 'MRI', bodyPart: 'ركبة' })).body
      .study;

    expect((await nour.cancel(chest.id)).status).toBe(404);
    expect((await sami.cancel(chest.id)).body.study.status).toBe('CANCELLED');
    await prisma.radiologyImage.update({ where: { id: knee.id }, data: { status: 'IN_PROGRESS' } });
    expect((await sami.cancel(knee.id)).status).toBe(409);
  });

  it('the study stays in the file, signed, if the doctor’s account goes', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const study = (await sami.order(sami.patient.id, { modality: 'ECHO', bodyPart: 'قلب' })).body
      .study;

    await prisma.user.delete({ where: { id: sami.id } });

    expect(await prisma.radiologyImage.findUnique({ where: { id: study.id } })).toMatchObject({
      doctorId: null,
      doctorName: 'د. سامي',
    });
  });
});
