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
  async function person(role: Role) {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    if (role === 'DOCTOR') {
      await prisma.doctorProfile.create({
        data: { hospitalId: id, userId: user.id, specialty: 'قلبية' },
      });
    }
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    return {
      ...user,
      token,
      status: () =>
        request(app).get('/api/doctors/me/status').set('Authorization', `Bearer ${token}`),
      setStatus: (status: unknown) =>
        request(app)
          .patch('/api/doctors/me/status')
          .set('Authorization', `Bearer ${token}`)
          .send({ status }),
    };
  }
  return { id, person };
}

/** Collects the query keys of every refresh event this person's connection hears. */
async function refreshes(token: string) {
  const socket = connectClient(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  const heard: string[] = [];
  socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
    heard.push(...queryKeys.map((key) => key.join('/'))),
  );
  await new Promise((resolve, reject) => {
    socket.once('ready', resolve);
    socket.once('connect_error', reject);
  });
  return heard;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

describe('doctor status', () => {
  it('a doctor starts available and can change their status', async () => {
    const doctor = await (await hospital()).person('DOCTOR');

    expect((await doctor.status()).body).toEqual({ status: 'AVAILABLE' });
    const res = await doctor.setStatus('ON_LEAVE');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ON_LEAVE' });
    expect((await doctor.status()).body).toEqual({ status: 'ON_LEAVE' });
  });

  it('refuses unknown statuses and anyone who is not a doctor', async () => {
    const h = await hospital();
    const doctor = await h.person('DOCTOR');
    const nurse = await h.person('NURSE');
    const admin = await h.person('ADMIN');

    expect((await doctor.setStatus('SLEEPING')).status).toBe(400);
    expect((await nurse.setStatus('BUSY')).status).toBe(403);
    expect((await admin.status()).status).toBe(403);
  });

  it('is broadcast live to the doctor and their hospital, nobody else', async () => {
    const h = await hospital();
    const other = await hospital();
    const doctor = await h.person('DOCTOR');
    const admin = await h.person('ADMIN');
    const stranger = await other.person('ADMIN');
    const [toDoctor, toAdmin, toStranger] = await Promise.all(
      [doctor, admin, stranger].map((person) => refreshes(person.token)),
    );

    await doctor.setStatus('BUSY');
    await settle();

    expect(toDoctor).toEqual(expect.arrayContaining(['doctor-status', 'staff', 'doctors']));
    expect(toAdmin).toEqual(['staff', 'doctors']);
    expect(toStranger).toEqual([]);
    const staff = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(staff.body.staff.find((s: { id: string }) => s.id === doctor.id).doctorStatus).toBe(
      'BUSY',
    );
  });
});
