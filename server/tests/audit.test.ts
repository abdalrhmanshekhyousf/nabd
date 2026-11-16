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

describe('the activity log page (task 4.22)', () => {
  it('lists entries newest first, filtered by name, action and dates; admin only', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const admin = await createUser(id, {
      email: 'a-' + crypto.randomUUID() + '@nabd.test',
      password: 'x',
      role: 'ADMIN',
    });
    const auth = {
      Authorization: 'Bearer ' + signAccessToken({ sub: admin.id, hospitalId: id, role: 'ADMIN' }),
    };
    const base = { hospitalId: id, method: 'GET', path: '/x', role: 'DOCTOR' as const };
    await prisma.auditLog.createMany({
      data: [
        {
          ...base,
          userName: 'د. ريم',
          action: 'VIEW',
          patientName: 'سارة',
          createdAt: new Date('2026-11-01T10:00:00Z'),
        },
        {
          ...base,
          userName: 'د. سامي',
          action: 'EDIT',
          patientName: 'عمر',
          createdAt: new Date('2026-11-05T10:00:00Z'),
        },
        {
          ...base,
          userName: 'د. ريم',
          action: 'EDIT',
          patientName: 'عمر',
          createdAt: new Date('2026-11-09T10:00:00Z'),
        },
      ],
    });
    const get = (query: object) => request(app).get('/api/audit').query(query).set(auth);
    const all = (await get({})).body;
    expect(all.total).toBe(3);
    expect(all.entries.map((e: { userName: string }) => e.userName)).toEqual([
      'د. ريم',
      'د. سامي',
      'د. ريم',
    ]);
    expect((await get({ search: 'سامي' })).body.total).toBe(1);
    expect((await get({ search: 'عمر', action: 'EDIT' })).body.total).toBe(2);
    expect((await get({ from: '2026-11-02', to: '2026-11-05' })).body.total).toBe(1);
    const doctor = await createUser(id, {
      email: 'd-' + crypto.randomUUID() + '@nabd.test',
      password: 'x',
      role: 'DOCTOR',
    });
    expect(
      (
        await request(app)
          .get('/api/audit')
          .set({
            Authorization:
              'Bearer ' + signAccessToken({ sub: doctor.id, hospitalId: id, role: 'DOCTOR' }),
          })
      ).status,
    ).toBe(403);
  });
});
