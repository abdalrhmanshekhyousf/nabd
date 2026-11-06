import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { attachRealtime, closeRealtime } from '../src/realtime/realtime.js';
import { transitionRoom } from '../src/services/orTransition.service.js';
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

type Role = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'CLEANER';

async function theatre() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [er, operations, ward] = await Promise.all(
    (['EMERGENCY', 'OPERATIONS', 'CARDIOLOGY'] as const).map((code) =>
      prisma.department.create({ data: { hospitalId: id, name: code, code } }),
    ),
  );
  async function person(
    role: Role,
    fullName: string,
    departmentId?: string,
    covers: string[] = [],
  ) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (departmentId)
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    if (covers.length) {
      await prisma.cleanerAssignment.createMany({
        data: covers.map((departmentId) => ({ hospitalId: id, userId: user.id, departmentId })),
      });
    }
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    return {
      ...user,
      token,
      step: (roomId: string, to: string) =>
        request(app)
          .post(`/api/operating-rooms/${roomId}/transition`)
          .set('Authorization', `Bearer ${token}`)
          .send({ to }),
      actors: async () =>
        (await request(app).get('/api/operating-rooms/me').set('Authorization', `Bearer ${token}`))
          .body.actors,
    };
  }
  const room = await prisma.operatingRoom.create({ data: { hospitalId: id, name: 'غرفة 1' } });
  return { id, er, operations, ward, room, person };
}

const statusOf = async (roomId: string) =>
  (await prisma.operatingRoom.findUnique({ where: { id: roomId } }))?.status;

describe('operating room transitions (task 2.19)', () => {
  it('works out who each person is in the operating rooms', async () => {
    const h = await theatre();
    expect(await (await h.person('ADMIN', 'المدير')).actors()).toEqual(['ADMIN']);
    expect(await (await h.person('DOCTOR', 'د. سامي', h.ward.id)).actors()).toEqual(['DOCTOR']);
    expect(await (await h.person('NURSE', 'لينا', h.er.id)).actors()).toEqual(['ER_NURSE']);
    expect(await (await h.person('NURSE', 'رامي', h.operations.id)).actors()).toEqual(['OR_NURSE']);
    expect(await (await h.person('NURSE', 'سلمى', h.ward.id)).actors()).toEqual([]);
    expect(
      await (await h.person('CLEANER', 'أبو محمد', undefined, [h.er.id, h.operations.id])).actors(),
    ).toEqual(['STERILIZER']);
    expect(await (await h.person('CLEANER', 'أم علي', undefined, [h.ward.id])).actors()).toEqual(
      [],
    );
  });

  it('goes round the whole cycle, each step by its people, all in the history', async () => {
    const h = await theatre();
    const doctor = await h.person('DOCTOR', 'د. سامي', h.ward.id);
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const sterilizer = await h.person('CLEANER', 'أبو محمد', undefined, [h.operations.id]);
    await transitionRoom(forHospital(h.id), {
      hospitalId: h.id,
      userId: doctor.id,
      roomId: h.room.id,
      to: 'BOOKED',
      viaBooking: true,
    });

    for (const [who, to] of [
      [orNurse, 'PREPARING'],
      [orNurse, 'IN_SURGERY'],
      [orNurse, 'AWAITING_STERILIZATION'],
      [sterilizer, 'STERILIZING'],
      [sterilizer, 'AVAILABLE'],
    ] as const) {
      const res = await who.step(h.room.id, to);
      expect(res.status).toBe(200);
      expect(res.body.operatingRoom.status).toBe(to);
    }

    const history = await prisma.operatingRoomStatusChange.findMany({
      where: { operatingRoomId: h.room.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((c) => `${c.toStatus} by ${c.changedByName}`)).toEqual([
      'BOOKED by د. سامي',
      'PREPARING by رامي',
      'IN_SURGERY by رامي',
      'AWAITING_STERILIZATION by رامي',
      'STERILIZING by أبو محمد',
      'AVAILABLE by أبو محمد',
    ]);
  });

  it('refuses the wrong people, skipped steps, and booking by a room button', async () => {
    const h = await theatre();
    const erNurse = await h.person('NURSE', 'لينا', h.er.id);
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const wardCleaner = await h.person('CLEANER', 'أم علي', undefined, [h.ward.id]);
    const doctor = await h.person('DOCTOR', 'د. سامي', h.ward.id);

    const byButton = await doctor.step(h.room.id, 'BOOKED');
    expect(byButton.status).toBe(409);
    expect(byButton.body.error.code).toBe('USE_BOOKING');

    await transitionRoom(forHospital(h.id), {
      hospitalId: h.id,
      userId: doctor.id,
      roomId: h.room.id,
      to: 'BOOKED',
      viaBooking: true,
    });
    expect((await erNurse.step(h.room.id, 'PREPARING')).status).toBe(403);
    const skipped = await orNurse.step(h.room.id, 'IN_SURGERY');
    expect(skipped.status).toBe(409);
    expect(skipped.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'BOOKED', to: 'IN_SURGERY' },
    });

    await orNurse.step(h.room.id, 'PREPARING');
    await orNurse.step(h.room.id, 'IN_SURGERY');
    await orNurse.step(h.room.id, 'AWAITING_STERILIZATION');
    expect((await wardCleaner.step(h.room.id, 'STERILIZING')).status).toBe(403);
    expect(await statusOf(h.room.id)).toBe('AWAITING_STERILIZATION');
    expect((await orNurse.step(h.room.id, 'NOT_A_STATE')).status).toBe(400);
  });

  it('maintenance stays the admin’s, and only when the room is free', async () => {
    const h = await theatre();
    const admin = await h.person('ADMIN', 'المدير');
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);

    expect((await orNurse.step(h.room.id, 'OUT_OF_SERVICE')).status).toBe(403);
    expect((await admin.step(h.room.id, 'OUT_OF_SERVICE')).body.operatingRoom.status).toBe(
      'OUT_OF_SERVICE',
    );
    expect((await admin.step(h.room.id, 'AVAILABLE')).body.operatingRoom.status).toBe('AVAILABLE');
  });

  it('another hospital’s room is not found, and every screen hears a step live', async () => {
    const h = await theatre();
    const other = await theatre();
    const admin = await h.person('ADMIN', 'المدير');
    const watcher = await h.person('DOCTOR', 'د. نور', h.ward.id);
    const stranger = await other.person('ADMIN', 'غريب');
    const socket = connectClient(url, {
      auth: { token: watcher.token },
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

    expect((await stranger.step(h.room.id, 'OUT_OF_SERVICE')).status).toBe(404);
    await admin.step(h.room.id, 'OUT_OF_SERVICE');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(heard).toEqual(['operating-rooms', 'bookings']);
  });

  it('the sterilizer hears the end of an operation live, with an urgent notice', async () => {
    const h = await theatre();
    const doctor = await h.person('DOCTOR', 'د. سامي', h.ward.id);
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const sterilizer = await h.person('CLEANER', 'أبو محمد', undefined, [h.operations.id]);
    await transitionRoom(forHospital(h.id), {
      hospitalId: h.id,
      userId: doctor.id,
      roomId: h.room.id,
      to: 'BOOKED',
      viaBooking: true,
    });
    await orNurse.step(h.room.id, 'PREPARING');
    await orNurse.step(h.room.id, 'IN_SURGERY');
    const socket = connectClient(url, {
      auth: { token: sterilizer.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const notices: { type: string; urgent: boolean }[] = [];
    const heard: string[] = [];
    socket.on('notification', (n: { type: string; urgent: boolean }) => notices.push(n));
    socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
      heard.push(...queryKeys.map((k) => k[0])),
    );
    await new Promise((resolve) => socket.once('ready', resolve));

    await orNurse.step(h.room.id, 'AWAITING_STERILIZATION');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(notices).toEqual([expect.objectContaining({ type: 'OPERATION_ENDED', urgent: true })]);
    expect(heard).toContain('cleaning-requests');
  });

  it('taking a room out of service reaches every live board (task 2.26)', async () => {
    const h = await theatre();
    const watcher = await h.person('DOCTOR', 'د. نور', h.ward.id);
    const admin = await h.person('ADMIN', 'المدير');
    const socket = connectClient(url, {
      auth: { token: watcher.token },
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

    await request(app)
      .patch(`/api/operating-rooms/${h.room.id}/service`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ outOfService: true });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(heard).toEqual(['operating-rooms', 'bookings']);
  });
});
