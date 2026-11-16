import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
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

const logsOf = (hospitalId: string) =>
  prisma.auditLog.findMany({ where: { hospitalId }, orderBy: { createdAt: 'asc' } });

describe('the audit log of patient files (task 4.21)', () => {
  it('records each opening and each change of a file, by whom, and not failed tries', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const doctor = await createUser(id, {
      email: `d-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.user.update({ where: { id: doctor.id }, data: { fullName: 'د. ريم' } });
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: 'سارة',
        medicalRecord: { create: { hospitalId: id, doctorId: doctor.id } },
      },
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: doctor.id, hospitalId: id, role: 'DOCTOR' })}`,
    };

    expect(
      (await request(app).get(`/api/doctors/me/patients/${patient.id}`).set(auth)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/doctors/me/patients/${patient.id}/reports`)
          .set(auth)
          .send({ title: 'مراجعة', diagnosis: '', content: 'الضغط 130/85.' })
      ).status,
    ).toBe(201);
    // A file that does not exist: nothing to record.
    await request(app).get(`/api/doctors/me/patients/${crypto.randomUUID()}`).set(auth);

    await vi.waitFor(async () => expect(await logsOf(id)).toHaveLength(2));
    const logs = await logsOf(id);
    expect(logs.map((log) => [log.action, log.userName, log.role, log.patientName])).toEqual([
      ['VIEW', 'د. ريم', 'DOCTOR', 'سارة'],
      ['EDIT', 'د. ريم', 'DOCTOR', 'سارة'],
    ]);
    expect(logs[0]!.path).toBe(`/api/doctors/me/patients/${patient.id}`);
  });

  it('records a patient opening their own file', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const user = await createUser(id, {
      email: `p-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'PATIENT',
    });
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: 'عمر',
        userId: user.id,
        medicalRecord: { create: { hospitalId: id } },
      },
    });
    await request(app)
      .get('/api/patients/me/file')
      .set({
        Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'PATIENT' })}`,
      });
    await vi.waitFor(async () => expect(await logsOf(id)).toHaveLength(1));
    expect((await logsOf(id))[0]).toMatchObject({ action: 'VIEW', patientId: patient.id });
  });
});
