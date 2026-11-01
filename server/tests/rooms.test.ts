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

async function setup(role: 'ADMIN' | 'NURSE' = 'ADMIN', hospitalId?: string) {
  const id = hospitalId ?? (await createHospital()).id;
  if (!hospitalId) hospitalIds.push(id);
  const user = await createUser(id, {
    email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const auth = `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`;
  const department = await prisma.department.create({
    data: { hospitalId: id, name: `قسم ${crypto.randomUUID().slice(0, 4)}` },
  });
  const call = {
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body?: object) =>
      request(app).post(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set('Authorization', auth).send(body),
    delete: (url: string) => request(app).delete(url).set('Authorization', auth),
  };
  return { hospitalId: id, departmentId: department.id, ...call };
}

const labels = (room: { beds: { label: string }[] }) => room.beds.map((bed) => bed.label);

describe('/api/rooms', () => {
  it('creates a room with its beds, numbered 1..n', async () => {
    const admin = await setup();

    const res = await admin.post('/api/rooms', {
      departmentId: admin.departmentId,
      number: ' 101 ',
      floor: 1,
      bedCount: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.room).toMatchObject({ number: '101', floor: 1 });
    expect(labels(res.body.room)).toEqual(['1', '2', '3']);
    expect(res.body.room.beds.every((b: { status: string }) => b.status === 'EMPTY')).toBe(true);

    const listed = await admin.get(`/api/rooms?departmentId=${admin.departmentId}`);
    expect(listed.body.rooms).toHaveLength(1);
    // The department now counts the room.
    const dept = (await admin.get('/api/departments')).body.departments[0];
    expect(dept.roomCount).toBe(1);
  });

  it('keeps room numbers unique per department and sorts them naturally', async () => {
    const admin = await setup();
    for (const number of ['10', '2', '1']) {
      await admin.post('/api/rooms', {
        departmentId: admin.departmentId,
        number,
        floor: null,
        bedCount: 0,
      });
    }

    const duplicate = await admin.post('/api/rooms', {
      departmentId: admin.departmentId,
      number: '2',
      floor: null,
      bedCount: 0,
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ROOM_EXISTS');
    const rooms = (await admin.get(`/api/rooms?departmentId=${admin.departmentId}`)).body.rooms;
    expect(rooms.map((r: { number: string }) => r.number)).toEqual(['1', '2', '10']);
  });

  it('edits a room and refuses a number already taken', async () => {
    const admin = await setup();
    const a = (
      await admin.post('/api/rooms', {
        departmentId: admin.departmentId,
        number: 'A',
        floor: null,
        bedCount: 0,
      })
    ).body.room;
    await admin.post('/api/rooms', {
      departmentId: admin.departmentId,
      number: 'B',
      floor: null,
      bedCount: 0,
    });

    const edited = await admin.patch(`/api/rooms/${a.id}`, { number: 'A1', floor: 2 });
    const taken = await admin.patch(`/api/rooms/${a.id}`, { number: 'B', floor: 2 });

    expect(edited.body.room).toMatchObject({ number: 'A1', floor: 2 });
    expect(taken.status).toBe(409);
  });

  it('adds beds with the next free number and removes them', async () => {
    const admin = await setup();
    const room = (
      await admin.post('/api/rooms', {
        departmentId: admin.departmentId,
        number: '1',
        floor: null,
        bedCount: 2,
      })
    ).body.room;

    const added = await admin.post(`/api/rooms/${room.id}/beds`, {});
    const named = await admin.post(`/api/rooms/${room.id}/beds`, { label: 'VIP' });
    const clash = await admin.post(`/api/rooms/${room.id}/beds`, { label: 'VIP' });

    expect(labels(added.body.room)).toEqual(['1', '2', '3']);
    expect(labels(named.body.room)).toEqual(['1', '2', '3', 'VIP']);
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('BED_EXISTS');

    const bed = added.body.room.beds[0];
    expect((await admin.delete(`/api/beds/${bed.id}`)).status).toBe(204);
    const after = (await admin.post(`/api/rooms/${room.id}/beds`, {})).body.room;
    expect(labels(after)).toEqual(['1', '2', '3', 'VIP']);
  });

  it('takes a bed out of service and back, but never one with a patient', async () => {
    const admin = await setup();
    const room = (
      await admin.post('/api/rooms', {
        departmentId: admin.departmentId,
        number: '1',
        floor: null,
        bedCount: 2,
      })
    ).body.room;
    const [free, busy] = room.beds;
    await prisma.bed.update({ where: { id: busy.id }, data: { status: 'OCCUPIED' } });

    const off = await admin.patch(`/api/beds/${free.id}`, { outOfService: true });
    expect(off.body.room.beds[0].status).toBe('OUT_OF_SERVICE');
    const back = await admin.patch(`/api/beds/${free.id}`, { outOfService: false });
    expect(back.body.room.beds[0].status).toBe('EMPTY');

    expect((await admin.patch(`/api/beds/${busy.id}`, { outOfService: true })).status).toBe(409);
    expect((await admin.delete(`/api/beds/${busy.id}`)).body.error.code).toBe('BED_IN_USE');
    expect((await admin.delete(`/api/rooms/${room.id}`)).body.error.code).toBe('ROOM_IN_USE');

    await prisma.bed.update({ where: { id: busy.id }, data: { status: 'EMPTY' } });
    expect((await admin.delete(`/api/rooms/${room.id}`)).status).toBe(204);
    expect(await prisma.bed.count({ where: { roomId: room.id } })).toBe(0);
  });

  it('limits beds per room and validates input', async () => {
    const admin = await setup();
    const tooMany = await admin.post('/api/rooms', {
      departmentId: admin.departmentId,
      number: '1',
      floor: null,
      bedCount: 21,
    });
    const room = (
      await admin.post('/api/rooms', {
        departmentId: admin.departmentId,
        number: '1',
        floor: null,
        bedCount: 20,
      })
    ).body.room;
    const twentyFirst = await admin.post(`/api/rooms/${room.id}/beds`, {});

    expect(tooMany.status).toBe(400);
    expect(twentyFirst.status).toBe(400);
    expect(twentyFirst.body.error.details[0].message).toBe('validation.tooMany');
  });

  it('lets staff look, but only the admin build', async () => {
    const admin = await setup();
    const nurse = await setup('NURSE', admin.hospitalId);
    await admin.post('/api/rooms', {
      departmentId: admin.departmentId,
      number: '1',
      floor: null,
      bedCount: 1,
    });

    expect((await nurse.get('/api/rooms')).body.rooms).toHaveLength(1);
    expect(
      (
        await nurse.post('/api/rooms', {
          departmentId: admin.departmentId,
          number: '2',
          floor: null,
          bedCount: 1,
        })
      ).status,
    ).toBe(403);
  });

  it("can't reach another hospital's departments, rooms or beds", async () => {
    const mine = await setup();
    const other = await setup();
    const theirs = (
      await other.post('/api/rooms', {
        departmentId: other.departmentId,
        number: '1',
        floor: null,
        bedCount: 1,
      })
    ).body.room;

    expect((await mine.get('/api/rooms')).body.rooms).toEqual([]);
    expect(
      (
        await mine.post('/api/rooms', {
          departmentId: other.departmentId,
          number: '9',
          floor: null,
          bedCount: 1,
        })
      ).status,
    ).toBe(404);
    expect((await mine.patch(`/api/rooms/${theirs.id}`, { number: 'x', floor: null })).status).toBe(
      404,
    );
    expect((await mine.post(`/api/rooms/${theirs.id}/beds`, {})).status).toBe(404);
    expect(
      (await mine.patch(`/api/beds/${theirs.beds[0].id}`, { outOfService: true })).status,
    ).toBe(404);
    expect((await mine.delete(`/api/beds/${theirs.beds[0].id}`)).status).toBe(404);
  });
});
