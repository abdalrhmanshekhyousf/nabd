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

describe("the patient's own file (task 3.23)", () => {
  it('shows the patient everything written and ordered, without staff notes; only theirs', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const account = async (role: 'PATIENT' | 'DOCTOR') => {
      const user = await createUser(id, {
        email: `${role}-${crypto.randomUUID()}@nabd.test`,
        password: 'x',
        role,
      });
      return {
        user,
        auth: {
          Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
        },
      };
    };
    const sara = await account('PATIENT');
    const omar = await account('PATIENT');
    const doctor = await account('DOCTOR');
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: 'سارة',
        userId: sara.user.id,
        medicalRecord: {
          create: {
            hospitalId: id,
            doctorId: doctor.user.id,
            allergies: 'البنسلين',
            notes: 'ملاحظة داخلية للطاقم',
          },
        },
      },
      include: { medicalRecord: true },
    });
    const recordId = patient.medicalRecord!.id;
    await prisma.doctorReport.create({
      data: {
        hospitalId: id,
        recordId,
        doctorName: 'د. سامي',
        title: 'زيارة',
        content: 'ضغط مضبوط',
      },
    });
    const key = await storeFile('lab-results', Buffer.from('%PDF-1.4 test'), 'application/pdf');
    const test = await prisma.labTest.create({
      data: {
        hospitalId: id,
        recordId,
        code: 'CBC',
        doctorName: 'د. سامي',
        status: 'DONE',
        result: 'طبيعي',
        resultFile: key,
      },
    });
    await prisma.consultation.create({
      data: {
        hospitalId: id,
        recordId,
        requesterName: 'د. سامي',
        consultantName: 'د. لينا',
        question: 'سؤال داخلي',
      },
    });

    const res = await request(app).get('/api/patients/me/file').set(sara.auth);
    expect(res.status).toBe(200);
    expect(res.body.patient).toMatchObject({ patientId: patient.id, fullName: 'سارة' });
    expect(res.body.record).toMatchObject({ allergies: 'البنسلين', notes: null });
    expect(res.body.reports.map((r: { title: string }) => r.title)).toEqual(['زيارة']);
    expect(res.body.labTests[0]).toMatchObject({
      code: 'CBC',
      result: 'طبيعي',
      hasResultFile: true,
    });
    expect(res.body.consultations).toEqual([]);
    // The result file opens for the patient, not for another patient.
    expect((await request(app).get(`/api/lab-tests/${test.id}/file`).set(sara.auth)).status).toBe(
      200,
    );
    expect((await request(app).get(`/api/lab-tests/${test.id}/file`).set(omar.auth)).status).toBe(
      404,
    );

    expect((await request(app).get('/api/patients/me/file').set(omar.auth)).status).toBe(404);
    expect((await request(app).get('/api/patients/me/file').set(doctor.auth)).status).toBe(403);
    await removeFile(key);
  });
});
