import { NOTIFICATION_TYPES } from '@nabd/shared';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { NotificationType } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { attachRealtime, closeRealtime } from '../src/realtime/realtime.js';
import { sendNotification } from '../src/services/notification.service.js';
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
  const [operations, er] = await Promise.all(
    ['العمليات', 'الإسعاف'].map((name) =>
      prisma.department.create({ data: { hospitalId: id, name } }),
    ),
  );
  async function person(
    role: Role,
    {
      departmentId,
      covers = [],
      isActive = true,
    }: { departmentId?: string; covers?: string[]; isActive?: boolean } = {},
  ) {
    const user = await createUser(id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
      isActive,
    });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    if (covers.length) {
      await prisma.cleanerAssignment.createMany({
        data: covers.map((departmentId) => ({ hospitalId: id, userId: user.id, departmentId })),
      });
    }
    return { ...user, token: signAccessToken({ sub: user.id, hospitalId: id, role }) };
  }
  return { id, operations, er, person, db: forHospital(id) };
}

/** A live connection that collects every `notification` it receives. */
async function inbox(token: string) {
  const socket = connectClient(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  const received: { type: string; urgent: boolean; data: unknown }[] = [];
  socket.on('notification', (item) => received.push(item));
  await new Promise((resolve, reject) => {
    socket.once('ready', resolve);
    socket.once('connect_error', reject);
  });
  return received;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

describe('sendNotification', () => {
  it('saves and pushes a notification to the people named, and marks urgent types', async () => {
    const h = await hospital();
    const doctor = await h.person('DOCTOR');
    const other = await h.person('DOCTOR');
    const [doctorInbox, otherInbox] = await Promise.all([inbox(doctor.token), inbox(other.token)]);

    const sent = await sendNotification(h.db, h.id, {
      to: { userIds: [doctor.id] },
      type: 'DOCTOR_CALL',
      data: { patient: 'مريض مجهول', level: 2 },
      link: '/doctor/calls',
    });
    await settle();

    expect(sent).toEqual([
      expect.objectContaining({
        type: 'DOCTOR_CALL',
        urgent: true,
        data: { patient: 'مريض مجهول', level: 2 },
        link: '/doctor/calls',
        readAt: null,
      }),
    ]);
    expect(doctorInbox).toEqual([expect.objectContaining({ id: sent[0].id, urgent: true })]);
    expect(otherInbox).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: doctor.id } })).toBe(1);
  });

  it('reaches a role in one department, counting cleaners who cover it', async () => {
    const h = await hospital();
    const sterilizer = await h.person('CLEANER', { covers: [h.er.id, h.operations.id] });
    const erCleaner = await h.person('CLEANER', { covers: [h.er.id] });
    const orNurse = await h.person('NURSE', { departmentId: h.operations.id });

    const sent = await sendNotification(h.db, h.id, {
      to: { role: 'CLEANER', departmentId: h.operations.id },
      type: 'OPERATION_ENDED',
      data: { room: 'غرفة العمليات 1' },
    });

    expect(sent).toHaveLength(1);
    const rows = await prisma.notification.findMany({ where: { hospitalId: h.id } });
    expect(rows.map((row) => row.userId)).toEqual([sterilizer.id]);
    expect([erCleaner.id, orNurse.id]).not.toContain(rows[0].userId);
  });

  it('reaches everyone with a role, but never disabled accounts', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    await h.person('ADMIN', { isActive: false });
    await h.person('NURSE');

    const sent = await sendNotification(h.db, h.id, {
      to: { role: 'ADMIN' },
      type: 'COMPLAINT',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].urgent).toBe(false);
    expect(await prisma.notification.findMany({ where: { hospitalId: h.id } })).toEqual([
      expect.objectContaining({ userId: admin.id }),
    ]);
  });

  it('never reaches anyone in another hospital, even when named', async () => {
    const h = await hospital();
    const other = await hospital();
    const stranger = await other.person('DOCTOR');
    const strangerInbox = await inbox(stranger.token);

    const sent = await sendNotification(h.db, h.id, {
      to: { userIds: [stranger.id] },
      type: 'DOCTOR_CALL',
    });
    await settle();

    expect(sent).toEqual([]);
    expect(strangerInbox).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: stranger.id } })).toBe(0);
  });
});

describe('GET /api/notifications', () => {
  it('lists only my notifications, newest first, with the unread count', async () => {
    const h = await hospital();
    const me = await h.person('NURSE');
    const someoneElse = await h.person('NURSE');
    await sendNotification(h.db, h.id, { to: { userIds: [me.id] }, type: 'CLEANING_REQUEST' });
    await sendNotification(h.db, h.id, { to: { userIds: [me.id] }, type: 'LOW_STOCK' });
    await sendNotification(h.db, h.id, { to: { userIds: [someoneElse.id] }, type: 'COMPLAINT' });
    await prisma.notification.updateMany({
      where: { userId: me.id, type: 'CLEANING_REQUEST' },
      data: { readAt: new Date() },
    });

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${me.token}`);

    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(1);
    expect(res.body.notifications.map((n: { type: string }) => n.type)).toEqual([
      'LOW_STOCK',
      'CLEANING_REQUEST',
    ]);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});

describe('notification types', () => {
  it('the shared list matches the database enum', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(Object.values(NotificationType).sort());
  });
});

describe('POST /api/dev/notify (development only)', () => {
  it('sends me a sample urgent notification and a refresh, live', async () => {
    const h = await hospital();
    const me = await h.person('NURSE');
    const socket = connectClient(url, {
      auth: { token: me.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const heard: string[] = [];
    socket.on('notification', (n: { type: string; urgent: boolean }) =>
      heard.push(`${n.type}:${n.urgent}`),
    );
    socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) =>
      heard.push(`refresh:${queryKeys.flat().join(',')}`),
    );
    await new Promise((resolve) => socket.once('ready', resolve));

    const res = await request(app)
      .post('/api/dev/notify')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ urgent: true });
    await settle();

    expect(res.status).toBe(201);
    expect(heard).toEqual(['DOCTOR_CALL:true', 'refresh:notifications']);
    expect((await request(app).post('/api/dev/notify').send({})).status).toBe(401);
  });
});

describe('marking notifications read', () => {
  async function withInbox() {
    const h = await hospital();
    const me = await h.person('NURSE');
    const other = await h.person('NURSE');
    const [first, second] = await Promise.all(
      ['CLEANING_REQUEST', 'LOW_STOCK'].map(async (type) => {
        const [sent] = await sendNotification(h.db, h.id, {
          to: { userIds: [me.id] },
          type: type as 'CLEANING_REQUEST',
        });
        return sent;
      }),
    );
    const [theirs] = await sendNotification(h.db, h.id, {
      to: { userIds: [other.id] },
      type: 'COMPLAINT',
    });
    const as = (token: string) => ({
      read: (id: string) =>
        request(app).patch(`/api/notifications/${id}/read`).set('Authorization', `Bearer ${token}`),
      readAll: () =>
        request(app).post('/api/notifications/read-all').set('Authorization', `Bearer ${token}`),
    });
    return { me, other, first, second, theirs, mine: as(me.token) };
  }

  it('marks one read and returns what is left unread', async () => {
    const { first, mine } = await withInbox();

    const res = await mine.read(first.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unread: 1 });
    expect(
      (await prisma.notification.findUnique({ where: { id: first.id } }))?.readAt,
    ).not.toBeNull();
  });

  it('keeps the first time it was read', async () => {
    const { first, mine } = await withInbox();
    await mine.read(first.id);
    const firstRead = (await prisma.notification.findUnique({ where: { id: first.id } }))?.readAt;

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await mine.read(first.id)).status).toBe(200);

    expect((await prisma.notification.findUnique({ where: { id: first.id } }))?.readAt).toEqual(
      firstRead,
    );
  });

  it('marks all of mine read, and never someone else’s', async () => {
    const { me, theirs, mine } = await withInbox();

    expect((await mine.read(theirs.id)).status).toBe(404);
    const res = await mine.readAll();

    expect(res.body).toEqual({ unread: 0 });
    expect(await prisma.notification.count({ where: { userId: me.id, readAt: null } })).toBe(0);
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } }))?.readAt).toBeNull();
  });

  it('tells my other open tabs to update their bell', async () => {
    const { me, first, mine } = await withInbox();
    const socket = connectClient(url, {
      auth: { token: me.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    const refreshed: string[][][] = [];
    socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) => refreshed.push(queryKeys));
    await new Promise((resolve) => socket.once('ready', resolve));

    await mine.read(first.id);
    await settle();

    expect(refreshed).toEqual([[['notifications']]]);
  });
});
