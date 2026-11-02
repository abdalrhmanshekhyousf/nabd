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

async function as(role: 'ADMIN' | 'DOCTOR', hospitalId?: string) {
  const id = hospitalId ?? (await createHospital()).id;
  if (!hospitalId) hospitalIds.push(id);
  const user = await createUser(id, {
    email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const auth = `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`;
  return {
    hospitalId: id,
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body: object) =>
      request(app).post(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set('Authorization', auth).send(body),
    delete: (url: string) => request(app).delete(url).set('Authorization', auth),
  };
}

describe('/api/operating-rooms', () => {
  it('creates rooms (available), lists them in natural order, names unique', async () => {
    const admin = await as('ADMIN');
    for (const name of ['غرفة 10', 'غرفة 2', 'غرفة 1']) {
      await admin.post('/api/operating-rooms', { name });
    }

    const duplicate = await admin.post('/api/operating-rooms', { name: 'غرفة 2' });
    const listed = (await admin.get('/api/operating-rooms')).body.operatingRooms;

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('OPERATING_ROOM_EXISTS');
    expect(listed.map((r: { name: string }) => r.name)).toEqual(['غرفة 1', 'غرفة 2', 'غرفة 10']);
    expect(listed.every((r: { status: string }) => r.status === 'AVAILABLE')).toBe(true);
  });

  it('renames, takes out of service and back, and deletes an idle room', async () => {
    const admin = await as('ADMIN');
    const { id } = (await admin.post('/api/operating-rooms', { name: 'A' })).body.operatingRoom;

    expect(
      (await admin.patch(`/api/operating-rooms/${id}`, { name: 'B' })).body.operatingRoom.name,
    ).toBe('B');
    const off = await admin.patch(`/api/operating-rooms/${id}/service`, { outOfService: true });
    expect(off.body.operatingRoom.status).toBe('OUT_OF_SERVICE');
    const on = await admin.patch(`/api/operating-rooms/${id}/service`, { outOfService: false });
    expect(on.body.operatingRoom.status).toBe('AVAILABLE');
    expect(new Date(on.body.operatingRoom.statusChangedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(off.body.operatingRoom.statusChangedAt).getTime(),
    );
    expect((await admin.delete(`/api/operating-rooms/${id}`)).status).toBe(204);
  });

  it.each(['BOOKED', 'PREPARING', 'IN_SURGERY', 'AWAITING_STERILIZATION', 'STERILIZING'] as const)(
    'leaves a room alone while it is %s',
    async (status) => {
      const admin = await as('ADMIN');
      const { id } = (await admin.post('/api/operating-rooms', { name: 'X' })).body.operatingRoom;
      await prisma.operatingRoom.update({ where: { id }, data: { status } });

      for (const res of [
        await admin.patch(`/api/operating-rooms/${id}`, { name: 'Y' }),
        await admin.patch(`/api/operating-rooms/${id}/service`, { outOfService: true }),
        await admin.delete(`/api/operating-rooms/${id}`),
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('OPERATING_ROOM_IN_USE');
      }
      expect((await prisma.operatingRoom.findUnique({ where: { id } }))?.status).toBe(status);
    },
  );

  it('lets staff see the rooms, only the admin manage them', async () => {
    const admin = await as('ADMIN');
    const doctor = await as('DOCTOR', admin.hospitalId);
    const { id } = (await admin.post('/api/operating-rooms', { name: 'A' })).body.operatingRoom;

    expect((await doctor.get('/api/operating-rooms')).body.operatingRooms).toHaveLength(1);
    expect((await doctor.post('/api/operating-rooms', { name: 'B' })).status).toBe(403);
    expect(
      (await doctor.patch(`/api/operating-rooms/${id}/service`, { outOfService: true })).status,
    ).toBe(403);
  });

  it("never reaches another hospital's rooms", async () => {
    const mine = await as('ADMIN');
    const other = await as('ADMIN');
    const { id } = (await other.post('/api/operating-rooms', { name: 'A' })).body.operatingRoom;

    expect((await mine.get('/api/operating-rooms')).body.operatingRooms).toEqual([]);
    expect((await mine.patch(`/api/operating-rooms/${id}`, { name: 'x' })).status).toBe(404);
    expect((await mine.delete(`/api/operating-rooms/${id}`)).status).toBe(404);
    // The same name in another hospital is fine.
    expect((await mine.post('/api/operating-rooms', { name: 'A' })).status).toBe(201);
  });
});
