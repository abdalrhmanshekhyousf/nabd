import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as connectClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { attachRealtime, closeRealtime, emitTo, rooms } from '../src/realtime/realtime.js';
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

/** A hospital with two departments; people are added with `person`. */
async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [er, ward] = await Promise.all(
    ['الإسعاف', 'الداخلية'].map((name) =>
      prisma.department.create({ data: { hospitalId: id, name } }),
    ),
  );
  async function person(role: Role, departmentId?: string) {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    return { ...user, token: signAccessToken({ sub: user.id, hospitalId: id, role }) };
  }
  const admin = await person('ADMIN');
  const api = (method: 'put' | 'patch', path: string, body: object) =>
    request(app)[method](path).set('Authorization', `Bearer ${admin.token}`).send(body);
  return { id, er, ward, person, api };
}

/** Connects like the browser will; resolves with the rooms the server put us in. */
function connect(token?: string) {
  const socket = connectClient(url, {
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise<{ socket: Socket; rooms: string[] }>((resolve, reject) => {
    socket.once('ready', ({ rooms: joined }: { rooms: string[] }) =>
      resolve({ socket, rooms: joined }),
    );
    socket.once('connect_error', reject);
  });
}

/** Resolves with what `socket` hears of `event` within `ms` (nothing → []). */
function listen(socket: Socket, event: string, ms = 300) {
  const heard: unknown[] = [];
  socket.on(event, (payload) => heard.push(payload));
  return new Promise<unknown[]>((resolve) => setTimeout(() => resolve(heard), ms));
}

const disconnected = (socket: Socket) =>
  new Promise<string>((resolve) => socket.once('disconnect', resolve));

describe('Socket.io connection', () => {
  it('refuses a missing, forged or expired token and a disabled account', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);
    await prisma.user.update({ where: { id: nurse.id }, data: { isActive: false } });
    const forged = jwt.sign({ sub: nurse.id, hospitalId: h.id, role: 'ADMIN' }, 'not-the-secret');
    const expired = jwt.sign(
      { sub: nurse.id, hospitalId: h.id, role: 'NURSE', exp: Math.floor(Date.now() / 1000) - 10 },
      env.jwtAccessSecret,
    );

    for (const token of [undefined, 'garbage', forged, expired, nurse.token]) {
      await expect(connect(token)).rejects.toThrow('UNAUTHENTICATED');
    }
  });

  it('puts each person in their hospital, own, role and department rooms', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);

    const { rooms: joined } = await connect(nurse.token);

    expect(joined.sort()).toEqual(
      [
        rooms.hospital(h.id),
        rooms.user(nurse.id),
        rooms.role(h.id, 'NURSE'),
        rooms.department(h.er.id),
      ].sort(),
    );
  });

  it('a cleaner joins every department they cover', async () => {
    const h = await hospital();
    const cleaner = await h.person('CLEANER');
    await h.api('put', `/api/assignments/cleaners/${cleaner.id}`, {
      departmentIds: [h.er.id, h.ward.id],
    });

    const { rooms: joined } = await connect(cleaner.token);

    expect(joined).toEqual(
      expect.arrayContaining([rooms.department(h.er.id), rooms.department(h.ward.id)]),
    );
  });
});

describe('emitTo', () => {
  it('reaches only the hospital, role, department or person it names', async () => {
    const h = await hospital();
    const other = await hospital();
    const nurse = await connect((await h.person('NURSE', h.er.id)).token);
    const doctor = await connect((await h.person('DOCTOR', h.ward.id)).token);
    const stranger = await connect((await other.person('NURSE', other.er.id)).token);

    const heard = [nurse, doctor, stranger].map(({ socket }) => listen(socket, 'ping'));
    emitTo(rooms.hospital(h.id), 'ping', 'hospital');
    emitTo(rooms.role(h.id, 'NURSE'), 'ping', 'nurses');
    emitTo(rooms.department(h.ward.id), 'ping', 'ward');
    const [toNurse, toDoctor, toStranger] = await Promise.all(heard);

    expect(toNurse).toEqual(['hospital', 'nurses']);
    expect(toDoctor).toEqual(['hospital', 'ward']);
    expect(toStranger).toEqual([]);
  });
});

describe('keeping rooms in step with the admin', () => {
  it('moving a nurse switches their department room at once', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);
    const { socket } = await connect(nurse.token);

    await h.api('put', `/api/assignments/nurses/${nurse.id}`, { departmentId: h.ward.id });

    const heard = listen(socket, 'ping');
    emitTo(rooms.department(h.er.id), 'ping', 'old');
    emitTo(rooms.department(h.ward.id), 'ping', 'new');
    expect(await heard).toEqual(['new']);
  });

  it('suspending an employee closes their connection', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);
    const { socket } = await connect(nurse.token);
    const closed = disconnected(socket);

    await h.api('patch', `/api/staff/${nurse.id}`, {
      fullName: 'لينا',
      phone: null,
      role: 'NURSE',
      departmentId: h.er.id,
      specialty: null,
      radiologyModality: null,
      salary: 0,
      email: nurse.email,
      password: '',
      isActive: false,
    });

    expect(await closed).toBe('io server disconnect');
  });

  it('closes the connection when the access token runs out', async () => {
    const h = await hospital();
    const nurse = await h.person('NURSE', h.er.id);
    const shortLived = jwt.sign(
      { sub: nurse.id, hospitalId: h.id, role: 'NURSE' },
      env.jwtAccessSecret,
      { algorithm: 'HS256', expiresIn: 1 },
    );
    const { socket } = await connect(shortLived);

    expect(await disconnected(socket)).toBe('io server disconnect');
  });
});
