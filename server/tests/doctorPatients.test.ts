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

type Role = Parameters<typeof signAccessToken>[0]['role'];

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: Role, fullName = 'x') {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    const get = (path: string) =>
      request(app).get(`/api/doctors/me/patients${path}`).set('Authorization', `Bearer ${token}`);
    return { ...user, get };
  }
  async function patient(fullName: string, doctorId: string | null) {
    return prisma.patient.create({
      data: {
        hospitalId: id,
        fullName,
        gender: 'FEMALE',
        dateOfBirth: new Date('1990-05-17'),
        medicalRecord: { create: { hospitalId: id, doctorId, allergies: 'البنسلين' } },
      },
      include: { medicalRecord: true },
    });
  }
  return { id, person, patient };
}

describe('GET /api/doctors/me/patients', () => {
  it('lists only my patients, with counts, searchable by name', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR', 'د. ريم');
    const colleague = await h.person('DOCTOR', 'د. سامر');
    const sara = await h.patient('سارة الأحمد', me.id);
    await h.patient('ليلى خوري', me.id);
    await h.patient('عمر حداد', colleague.id);
    await prisma.doctorReport.create({
      data: {
        hospitalId: h.id,
        recordId: sara.medicalRecord!.id,
        doctorId: me.id,
        doctorName: 'د. ريم',
        title: 'مراجعة',
        content: 'مستقرة',
      },
    });

    const all = (await me.get('')).body.patients;
    expect(all.map((p: { fullName: string }) => p.fullName).sort()).toEqual(
      ['سارة الأحمد', 'ليلى خوري'].sort(),
    );
    expect(all.find((p: { fullName: string }) => p.fullName === 'سارة الأحمد')).toMatchObject({
      patientId: sara.id,
      gender: 'FEMALE',
      dateOfBirth: '1990-05-17',
      reportCount: 1,
      prescriptionCount: 0,
      lastReportAt: expect.any(String),
    });

    const found = (await me.get(`?search=${encodeURIComponent('سارة')}`)).body.patients;
    expect(found.map((p: { fullName: string }) => p.fullName)).toEqual(['سارة الأحمد']);
  });
});

describe('GET /api/doctors/me/patients/:patientId', () => {
  it('returns the whole file, newest report and prescription first', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR', 'د. ريم');
    const sara = await h.patient('سارة الأحمد', me.id);
    const recordId = sara.medicalRecord!.id;
    for (const title of ['أول زيارة', 'ثاني زيارة']) {
      await prisma.doctorReport.create({
        data: {
          hospitalId: h.id,
          recordId,
          doctorId: me.id,
          doctorName: 'د. ريم',
          title,
          content: '...',
        },
      });
    }
    await prisma.prescription.create({
      data: {
        hospitalId: h.id,
        recordId,
        doctorId: me.id,
        doctorName: 'د. ريم',
        items: {
          create: [
            { hospitalId: h.id, drugName: 'أملوديبين', dose: '5 ملغ', frequency: 'مرة باليوم' },
          ],
        },
      },
    });

    const res = await me.get(`/${sara.id}`);

    expect(res.status).toBe(200);
    expect(res.body.patient).toMatchObject({ fullName: 'سارة الأحمد', dateOfBirth: '1990-05-17' });
    expect(res.body.record).toMatchObject({ doctorName: 'د. ريم', allergies: 'البنسلين' });
    expect(res.body.reports.map((r: { title: string }) => r.title)).toEqual([
      'ثاني زيارة',
      'أول زيارة',
    ]);
    expect(res.body.prescriptions[0]).toMatchObject({
      status: 'PENDING',
      items: [expect.objectContaining({ drugName: 'أملوديبين', dose: '5 ملغ' })],
    });
  });

  it('another doctor’s patient, or another hospital’s, is not found', async () => {
    const h = await hospital();
    const other = await hospital();
    const me = await h.person('DOCTOR');
    const colleague = await h.person('DOCTOR');
    const theirs = await h.patient('عمر', colleague.id);
    const stranger = await other.patient('غريب', null);

    expect((await me.get(`/${theirs.id}`)).status).toBe(404);
    expect((await me.get(`/${stranger.id}`)).status).toBe(404);
    expect((await me.get('/not-a-uuid')).status).toBe(400);
  });

  it('is for doctors only', async () => {
    const h = await hospital();
    for (const role of ['ADMIN', 'NURSE', 'PATIENT'] as const) {
      expect((await (await h.person(role)).get('')).status).toBe(403);
    }
  });
});
