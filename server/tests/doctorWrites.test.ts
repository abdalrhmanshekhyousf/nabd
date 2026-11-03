import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { attachRealtime, closeRealtime } from '../src/realtime/realtime.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
let url = '';
const hospitalIds: string[] = [];
const sockets: Socket[] = [];

beforeAll(async () => {
  const server = app.listen(0);
  attachRealtime(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await closeRealtime();
  await prisma.$disconnect();
});

type Role = Parameters<typeof signAccessToken>[0]['role'];

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: Role, fullName = 'د. ريم العلي') {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    const post = (patientId: string, kind: 'reports' | 'prescriptions', body: object) =>
      request(app)
        .post(`/api/doctors/me/patients/${patientId}/${kind}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const myPatients = async () =>
      (await request(app).get('/api/doctors/me/patients').set('Authorization', `Bearer ${token}`))
        .body.patients;
    return { ...user, token, post, myPatients };
  }
  const patient = (fullName: string, doctorId: string) =>
    prisma.patient.create({
      data: { hospitalId: id, fullName, medicalRecord: { create: { hospitalId: id, doctorId } } },
    });
  return { id, person, patient };
}

const REPORT = { title: 'مراجعة', diagnosis: '', content: 'الضغط 130/85.' };
const PRESCRIPTION = {
  items: [
    {
      drugName: 'أملوديبين',
      dose: '5 ملغ',
      frequency: 'مرة باليوم',
      durationDays: 30,
      instructions: '',
    },
    {
      drugName: 'أسبرين',
      dose: '81 ملغ',
      frequency: 'مرة باليوم',
      durationDays: null,
      instructions: 'بعد الأكل',
    },
  ],
  notes: '',
};

describe('writing in a patient file', () => {
  it('adds a report signed with my name, and puts the patient on top of my list', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR');
    const sara = await h.patient('سارة', me.id);
    await h.patient('ليلى', me.id);

    const res = await me.post(sara.id, 'reports', REPORT);

    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({
      doctorName: 'د. ريم العلي',
      title: 'مراجعة',
      diagnosis: null,
      content: 'الضغط 130/85.',
    });
    expect((await me.myPatients())[0]).toMatchObject({ fullName: 'سارة', reportCount: 1 });
  });

  it('adds a prescription with its medicines, waiting for the pharmacy', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR');
    const sara = await h.patient('سارة', me.id);

    const res = await me.post(sara.id, 'prescriptions', PRESCRIPTION);

    expect(res.status).toBe(201);
    expect(res.body.prescription).toMatchObject({ status: 'PENDING', notes: null });
    expect(res.body.prescription.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ drugName: 'أملوديبين', durationDays: 30, instructions: null }),
        expect.objectContaining({ drugName: 'أسبرين', instructions: 'بعد الأكل' }),
      ]),
    );
    expect(await prisma.prescriptionItem.count({ where: { hospitalId: h.id } })).toBe(2);
  });

  it('refuses someone else’s patient, other roles and incomplete forms', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR');
    const colleague = await h.person('DOCTOR', 'د. سامر');
    const nurse = await h.person('NURSE');
    const theirs = await h.patient('عمر', colleague.id);
    const mine = await h.patient('سارة', me.id);

    expect((await me.post(theirs.id, 'reports', REPORT)).status).toBe(404);
    expect((await nurse.post(mine.id, 'reports', REPORT)).status).toBe(403);
    expect((await me.post(mine.id, 'prescriptions', { items: [], notes: null })).status).toBe(400);
    expect((await me.post(mine.id, 'reports', { ...REPORT, content: '' })).status).toBe(400);
    expect(await prisma.doctorReport.count({ where: { hospitalId: h.id } })).toBe(0);
  });

  it('a new prescription reaches the pharmacists’ screens live', async () => {
    const h = await hospital();
    const me = await h.person('DOCTOR');
    const pharmacist = await h.person('PHARMACIST', 'صيدلي');
    const sara = await h.patient('سارة', me.id);
    const socket = connectClient(url, {
      auth: { token: pharmacist.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const heard: string[] = [];
    socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
      heard.push(...queryKeys.map((key) => key.join('/'))),
    );
    await new Promise((resolve) => socket.once('ready', resolve));

    await me.post(sara.id, 'prescriptions', PRESCRIPTION);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(heard).toEqual(['prescriptions']);
  });
});
