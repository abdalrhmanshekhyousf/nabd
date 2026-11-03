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
  const [er, ward] = await Promise.all([
    prisma.department.create({ data: { hospitalId: id, name: 'الإسعاف', code: 'EMERGENCY' } }),
    prisma.department.create({
      data: { hospitalId: id, name: 'الداخلية', code: 'INTERNAL_MEDICINE' },
    }),
  ]);
  async function person(role: Role, departmentId?: string) {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    return {
      ...user,
      token,
      me: () => request(app).get('/api/er/me').set('Authorization', `Bearer ${token}`),
      register: (body: object) =>
        request(app).post('/api/er/visits').set('Authorization', `Bearer ${token}`).send(body),
    };
  }
  return { id, er, ward, person };
}

const UNKNOWN = {
  anonymous: true,
  gender: 'MALE',
  chiefComplaint: 'غياب وعي',
  arrivalNote: 'رجل حوالي 40، سيارة إسعاف',
};
const known = (overrides = {}) => ({
  anonymous: false,
  fullName: 'سارة الأحمد',
  phone: '0991234567',
  dateOfBirth: '1990-05-17',
  nationalId: '01020304',
  gender: 'FEMALE',
  chiefComplaint: 'ألم بطن شديد',
  arrivalNote: null,
  ...overrides,
});

describe('POST /api/er/visits', () => {
  it('registers an unidentified arrival, waiting for triage, with an empty file', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);

    const res = await nurse.register(UNKNOWN);

    expect(res.status).toBe(201);
    expect(res.body.visit).toMatchObject({
      isAnonymous: true,
      patientName: null,
      status: 'WAITING',
      returning: false,
    });
    const visit = await prisma.triageAssessment.findUnique({
      where: { id: res.body.visit.id },
      include: { patient: { include: { medicalRecord: true } } },
    });
    expect(visit).toMatchObject({
      nurseId: nurse.id,
      chiefComplaint: 'غياب وعي',
      arrivalNote: 'رجل حوالي 40، سيارة إسعاف',
      level: null,
      patient: { isAnonymous: true, gender: 'MALE', fullName: null },
    });
    expect(visit?.patient.medicalRecord).not.toBeNull();
  });

  it('registers a known patient, and finds them by national ID when they come back', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);

    const first = await nurse.register(known());
    const again = await nurse.register(known({ chiefComplaint: 'دوخة' }));

    expect(first.body.visit).toMatchObject({ patientName: 'سارة الأحمد', returning: false });
    expect(again.body.visit).toMatchObject({
      patientId: first.body.visit.patientId,
      returning: true,
    });
    expect(await prisma.patient.count({ where: { hospitalId: h.id } })).toBe(1);
    expect(await prisma.triageAssessment.count({ where: { hospitalId: h.id } })).toBe(2);
  });

  it('is for emergency nurses only', async () => {
    const h = await hospital();
    const wardNurse = await h.person('NURSE', h.ward.id);
    const doctor = await h.person('DOCTOR', h.er.id);
    const erNurse = await h.person('NURSE', h.er.id);

    expect((await wardNurse.register(UNKNOWN)).status).toBe(403);
    expect((await doctor.register(UNKNOWN)).status).toBe(403);
    expect((await erNurse.me()).body).toEqual({ canRegister: true });
    expect((await wardNurse.me()).body).toEqual({ canRegister: false });
    expect(await prisma.triageAssessment.count({ where: { hospitalId: h.id } })).toBe(0);
  });

  it('refuses a registration without a complaint, or a known patient without a name', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);

    expect((await nurse.register({ ...UNKNOWN, chiefComplaint: '' })).status).toBe(400);
    expect((await nurse.register(known({ fullName: '' }))).status).toBe(400);
  });

  it('tells the emergency department’s screens to update their waiting list', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);
    const colleague = await h.person('NURSE', h.er.id);
    const wardNurse = await h.person('NURSE', h.ward.id);
    const listen = async (token: string) => {
      const socket = connectClient(url, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const heard: string[] = [];
      socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
        heard.push(...queryKeys.map((k) => k.join('/'))),
      );
      await new Promise((resolve) => socket.once('ready', resolve));
      return heard;
    };
    const [toColleague, toWard] = await Promise.all([
      listen(colleague.token),
      listen(wardNurse.token),
    ]);

    await nurse.register(UNKNOWN);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(toColleague).toEqual(['er-queue']);
    expect(toWard).toEqual([]);
  });
});
