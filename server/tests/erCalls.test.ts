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

type Status = 'AVAILABLE' | 'BUSY' | 'ON_LEAVE';

async function er() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [erDept, ward] = await Promise.all([
    prisma.department.create({ data: { hospitalId: id, name: 'الإسعاف', code: 'EMERGENCY' } }),
    prisma.department.create({ data: { hospitalId: id, name: 'القلبية', code: 'CARDIOLOGY' } }),
  ]);
  async function user(role: 'NURSE' | 'DOCTOR', fullName: string, departmentId: string) {
    const created = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: created.id }, data: { fullName } });
    await prisma.staffProfile.create({
      data: { hospitalId: id, userId: created.id, departmentId },
    });
    return {
      ...created,
      fullName,
      token: signAccessToken({ sub: created.id, hospitalId: id, role }),
    };
  }
  async function doctor(fullName: string, specialty: string, status: Status) {
    const created = await user('DOCTOR', fullName, ward.id);
    await prisma.doctorProfile.create({
      data: { hospitalId: id, userId: created.id, specialty, status },
    });
    return created;
  }
  const nurse = await user('NURSE', 'لينا', erDept.id);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const patient = await prisma.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة الأحمد',
      medicalRecord: { create: { hospitalId: id } },
    },
  });
  const visit = await prisma.triageAssessment.create({
    data: {
      hospitalId: id,
      patientId: patient.id,
      chiefComplaint: 'ألم بالصدر',
      level: 2,
      suggestedLevel: 2,
    },
  });
  return {
    id,
    ward,
    nurse,
    visit,
    user,
    doctor,
    doctors: () => request(app).get('/api/er/doctors').set(auth(nurse.token)),
    call: (doctorId: string, token = nurse.token) =>
      request(app).post(`/api/er/visits/${visit.id}/calls`).set(auth(token)).send({ doctorId }),
    cancel: (callId: string) =>
      request(app).delete(`/api/er/visits/${visit.id}/calls/${callId}`).set(auth(nurse.token)),
    queue: () => request(app).get('/api/er/queue').set(auth(nurse.token)),
  };
}

async function inbox(token: string) {
  const socket = connectClient(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  const received: { type: string; urgent: boolean; data: Record<string, unknown>; link: string }[] =
    [];
  socket.on('notification', (item) => received.push(item));
  await new Promise((resolve) => socket.once('ready', resolve));
  return received;
}

describe('calling a doctor (task 2.16)', () => {
  it('lists the doctors with their live status and department', async () => {
    const h = await er();
    await h.doctor('د. ريم', 'قلبية', 'BUSY');
    await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');

    const res = await h.doctors();

    expect(res.status).toBe(200);
    expect(res.body.doctors).toEqual([
      expect.objectContaining({
        fullName: 'د. ريم',
        specialty: 'قلبية',
        status: 'BUSY',
        department: expect.objectContaining({ code: 'CARDIOLOGY' }),
      }),
      expect.objectContaining({ fullName: 'د. سامي', status: 'AVAILABLE' }),
    ]);
  });

  it('calls an available doctor, who gets an urgent notification at once', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const received = await inbox(sami.token);

    const res = await h.call(sami.id);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(res.status).toBe(201);
    expect(res.body.call).toMatchObject({
      status: 'PENDING',
      doctorId: sami.id,
      doctorName: 'د. سامي',
    });
    expect(received).toEqual([
      expect.objectContaining({
        type: 'DOCTOR_CALL',
        urgent: true,
        data: { patient: 'سارة الأحمد', level: 2, complaint: 'ألم بالصدر' },
        link: '/doctor/calls',
      }),
    ]);
    const card = (await h.queue()).body.visits[0];
    expect(card.call).toMatchObject({ status: 'PENDING', doctorName: 'د. سامي' });
  });

  it('refuses a busy doctor or one on leave, offering available ones of the same specialty', async () => {
    const h = await er();
    const reem = await h.doctor('د. ريم', 'قلبية', 'BUSY');
    const lina = await h.doctor('د. لينا', 'قلبية', 'ON_LEAVE');
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    await h.doctor('د. عمر', 'عظمية', 'AVAILABLE');

    for (const unavailable of [reem, lina]) {
      const res = await h.call(unavailable.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DOCTOR_UNAVAILABLE');
      expect(res.body.error.details.alternatives.map((d: { id: string }) => d.id)).toEqual([
        sami.id,
      ]);
    }
    expect(await prisma.doctorCall.count({ where: { hospitalId: h.id } })).toBe(0);
  });

  it('one call at a time per patient; a cancelled call frees the way', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const nour = await h.doctor('د. نور', 'قلبية', 'AVAILABLE');

    const first = await h.call(sami.id);
    const second = await h.call(nour.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CALL_PENDING');

    expect((await h.cancel(first.body.call.id)).body.call.status).toBe('CANCELLED');
    expect((await h.call(nour.id)).status).toBe(201);
  });

  it('is for emergency nurses, for doctors of this hospital', async () => {
    const h = await er();
    const other = await er();
    const stranger = await other.doctor('د. غريب', 'قلبية', 'AVAILABLE');
    const wardNurse = await h.user('NURSE', 'ممرض القلبية', h.ward.id);
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');

    expect((await h.call(stranger.id)).status).toBe(404);
    expect((await h.call(sami.id, wardNurse.token)).status).toBe(403);
    expect((await h.call(sami.id, sami.token)).status).toBe(403);
  });
});

describe('the doctor answers a call (task 2.9)', () => {
  const as = (token: string) => ({
    calls: () => request(app).get('/api/doctors/me/calls').set('Authorization', `Bearer ${token}`),
    accept: (id: string) =>
      request(app)
        .post(`/api/doctors/me/calls/${id}/accept`)
        .set('Authorization', `Bearer ${token}`),
    decline: (id: string, reason: string) =>
      request(app)
        .post(`/api/doctors/me/calls/${id}/decline`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason }),
  });

  it('lists my calls; accepting starts the treatment and makes the patient mine', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const { call } = (await h.call(sami.id)).body;
    const me = as(sami.token);

    const listed = (await me.calls()).body;
    expect(listed.pending).toEqual([
      expect.objectContaining({
        id: call.id,
        calledBy: 'لينا',
        visit: expect.objectContaining({
          level: 2,
          chiefComplaint: 'ألم بالصدر',
          patient: expect.objectContaining({ fullName: 'سارة الأحمد' }),
        }),
      }),
    ]);

    const accepted = await me.accept(call.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body.call).toMatchObject({
      status: 'ACCEPTED',
      respondedAt: expect.any(String),
    });
    expect((await prisma.triageAssessment.findUnique({ where: { id: h.visit.id } }))?.status).toBe(
      'IN_TREATMENT',
    );
    const record = await prisma.medicalRecord.findFirst({
      where: { patientId: h.visit.patientId },
    });
    expect(record?.doctorId).toBe(sami.id);
    expect((await me.calls()).body).toMatchObject({
      pending: [],
      answered: [expect.objectContaining({ status: 'ACCEPTED' })],
    });
    expect((await h.queue()).body.visits[0].call).toMatchObject({
      status: 'ACCEPTED',
      doctorName: 'د. سامي',
    });
  });

  it('declining needs a reason, and leaves the patient waiting', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const { call } = (await h.call(sami.id)).body;
    const me = as(sami.token);

    expect((await me.decline(call.id, '  ')).status).toBe(400);
    const declined = await me.decline(call.id, 'عم عالج حالة تانية');

    expect(declined.body.call).toMatchObject({
      status: 'DECLINED',
      declineReason: 'عم عالج حالة تانية',
    });
    expect((await prisma.triageAssessment.findUnique({ where: { id: h.visit.id } }))?.status).toBe(
      'WAITING',
    );
    expect((await h.queue()).body.visits[0].call).toMatchObject({
      status: 'DECLINED',
      declineReason: 'عم عالج حالة تانية',
    });
  });

  it('answers once, only my own calls, never a withdrawn one', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const nour = await h.doctor('د. نور', 'قلبية', 'AVAILABLE');
    const first = (await h.call(sami.id)).body.call;

    expect((await as(nour.token).accept(first.id)).status).toBe(404);
    expect((await as(sami.token).accept(first.id)).status).toBe(200);
    const again = await as(sami.token).decline(first.id, 'x');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CALL_ANSWERED');

    const other = await er();
    const zaid = await other.doctor('د. زيد', 'قلبية', 'AVAILABLE');
    const withdrawn = (await other.call(zaid.id)).body.call;
    await other.cancel(withdrawn.id);
    expect((await as(zaid.token).accept(withdrawn.id)).body.error.code).toBe('CALL_ANSWERED');
    expect((await as(h.nurse.token).calls()).status).toBe(403);
  });

  it('the nurse’s screens hear the answer live', async () => {
    const h = await er();
    const sami = await h.doctor('د. سامي', 'قلبية', 'AVAILABLE');
    const { call } = (await h.call(sami.id)).body;
    const socket = connectClient(url, {
      auth: { token: h.nurse.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const heard: string[] = [];
    socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
      heard.push(...queryKeys.map((k) => k[0])),
    );
    await new Promise((resolve) => socket.once('ready', resolve));

    await as(sami.token).accept(call.id);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(heard).toEqual(['er-queue', 'er-visit']);
  });
});
