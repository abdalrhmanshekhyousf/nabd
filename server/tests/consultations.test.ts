import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { removeFile, storeFile } from '../src/lib/uploads.js';
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
  async function doctor(fullName: string, role: 'DOCTOR' | 'NURSE' = 'DOCTOR') {
    const user = await createUser(id, {
      email: `d-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (role === 'DOCTOR') {
      await prisma.doctorProfile.create({
        data: { hospitalId: id, userId: user.id, specialty: 'باطنية' },
      });
    }
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: `مريض ${fullName}`,
        medicalRecord: { create: { hospitalId: id, doctorId: user.id } },
      },
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      patient,
      ask: (patientId: string, body: object) =>
        request(app)
          .post(`/api/doctors/me/patients/${patientId}/consultations`)
          .set(auth)
          .send(body),
      withdraw: (consultationId: string) =>
        request(app).delete(`/api/doctors/me/consultations/${consultationId}`).set(auth),
      list: () => request(app).get('/api/doctors/me/consultations').set(auth),
      read: (consultationId: string) =>
        request(app).get(`/api/doctors/me/consultations/${consultationId}/file`).set(auth),
      labFile: (testId: string) => request(app).get(`/api/lab-tests/${testId}/file`).set(auth),
      colleagues: () => request(app).get('/api/doctors/me/colleagues').set(auth),
      file: (patientId: string) =>
        request(app).get(`/api/doctors/me/patients/${patientId}`).set(auth),
    };
  }
  return { id, doctor };
}

describe('consultations (task 3.12)', () => {
  it('the treating doctor asks a colleague; it is in the file, both lists and a notice', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const lina = await h.doctor('د. لينا');

    const colleagues = (await sami.colleagues()).body.doctors.map((d: { id: string }) => d.id);
    expect(colleagues).toContain(lina.id);
    expect(colleagues).not.toContain(sami.id);

    const res = await sami.ask(sami.patient.id, {
      consultantId: lina.id,
      question: '  تخطيط القلب فيه تغيرات، شو رأيك؟ ',
    });
    expect(res.status).toBe(201);
    expect(res.body.consultation).toMatchObject({
      status: 'PENDING',
      question: 'تخطيط القلب فيه تغيرات، شو رأيك؟',
      requesterName: 'د. سامي',
      consultantName: 'د. لينا',
      reply: null,
      patient: { patientId: sami.patient.id, fullName: 'مريض د. سامي' },
    });
    const id = res.body.consultation.id;

    expect(
      (await sami.file(sami.patient.id)).body.consultations.map((c: { id: string }) => c.id),
    ).toEqual([id]);
    expect((await sami.list()).body.sent.map((c: { id: string }) => c.id)).toEqual([id]);
    expect((await lina.list()).body.received.map((c: { id: string }) => c.id)).toEqual([id]);

    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: lina.id } });
    expect(notice).toMatchObject({
      type: 'CONSULTATION_REQUEST',
      data: { patient: 'مريض د. سامي', from: 'د. سامي' },
      link: `/doctor/consultations?open=${id}`,
    });
  });

  it('one open question per colleague; not my patient, myself or a non-doctor are refused', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const lina = await h.doctor('د. لينا');
    const nurse = await h.doctor('ممرض', 'NURSE');
    const ask = (body: object, patientId = sami.patient.id) =>
      sami.ask(patientId, { question: 'سؤال', ...body });

    expect((await ask({ consultantId: lina.id })).status).toBe(201);
    expect((await ask({ consultantId: lina.id })).body.error.code).toBe('ALREADY_PENDING');
    expect((await ask({ consultantId: sami.id })).body.error.code).toBe('INVALID_CONSULTANT');
    expect((await ask({ consultantId: nurse.id })).body.error.code).toBe('INVALID_CONSULTANT');
    expect((await ask({ consultantId: crypto.randomUUID() })).status).toBe(400);
    expect((await ask({ consultantId: sami.id }, lina.patient.id)).status).toBe(404);
    expect((await ask({ consultantId: lina.id, question: ' ' })).status).toBe(400);
  });

  it('withdrawing an open question hides it from the colleague; only the asker can', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const lina = await h.doctor('د. لينا');
    const { id } = (await sami.ask(sami.patient.id, { consultantId: lina.id, question: 'سؤال' }))
      .body.consultation;

    expect((await lina.withdraw(id)).status).toBe(404);
    const res = await sami.withdraw(id);
    expect(res.status).toBe(200);
    expect(res.body.consultation.status).toBe('CANCELLED');
    expect((await sami.withdraw(id)).body.error.code).toBe('INVALID_TRANSITION');
    expect((await lina.list()).body.received).toEqual([]);
    // Asking again after withdrawing is fine.
    expect(
      (await sami.ask(sami.patient.id, { consultantId: lina.id, question: 'سؤال تاني' })).status,
    ).toBe(201);
  });

  it('the consulted doctor reads the file only while the question is open (task 3.13)', async () => {
    const h = await clinic();
    const sami = await h.doctor('د. سامي');
    const lina = await h.doctor('د. لينا');
    const basel = await h.doctor('د. باسل');
    const record = await prisma.medicalRecord.findUniqueOrThrow({
      where: { patientId: sami.patient.id },
    });
    await prisma.medicalRecord.update({
      where: { id: record.id },
      data: { allergies: 'البنسلين' },
    });
    const key = await storeFile('lab-results', Buffer.from('%PDF-1.4 test'), 'application/pdf');
    const test = await prisma.labTest.create({
      data: {
        hospitalId: h.id,
        recordId: record.id,
        code: 'CBC',
        doctorName: 'د. سامي',
        status: 'DONE',
        result: 'طبيعي',
        resultFile: key,
      },
    });
    const { id } = (await sami.ask(sami.patient.id, { consultantId: lina.id, question: 'رأيك؟' }))
      .body.consultation;

    // Lina is not the treating doctor: she reads the file through the consultation only.
    expect((await lina.file(sami.patient.id)).status).toBe(404);
    const read = await lina.read(id);
    expect(read.status).toBe(200);
    expect(read.body.consultation).toMatchObject({ id, question: 'رأيك؟', status: 'PENDING' });
    expect(read.body.file.record.allergies).toBe('البنسلين');
    expect(read.body.file.labTests.map((t: { id: string }) => t.id)).toEqual([test.id]);
    expect(read.body.file.consultations).toEqual([]);
    expect((await lina.labFile(test.id)).status).toBe(200);

    // Nobody else: not another doctor, not the asker through this route.
    expect((await basel.read(id)).status).toBe(404);
    expect((await basel.labFile(test.id)).status).toBe(404);
    expect((await sami.read(id)).status).toBe(404);

    // Once withdrawn (or answered, 3.14) the access ends.
    await sami.withdraw(id);
    const closed = await lina.read(id);
    expect(closed.status).toBe(403);
    expect(closed.body.error.code).toBe('CONSULTATION_CLOSED');
    expect((await lina.labFile(test.id)).status).toBe(404);
    await removeFile(key);
  });
});
