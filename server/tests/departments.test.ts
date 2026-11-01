import { DEPARTMENT_CODES } from '@nabd/shared';
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

async function staffOf(role: 'ADMIN' | 'DOCTOR', hospitalId?: string) {
  const id = hospitalId ?? (await createHospital()).id;
  if (!hospitalId) hospitalIds.push(id);
  const user = await createUser(id, {
    email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  return {
    hospitalId: id,
    auth: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
  };
}

const as = (auth: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', auth),
  post: (url: string, body?: object) =>
    request(app).post(url).set('Authorization', auth).send(body),
  patch: (url: string, body: object) =>
    request(app).patch(url).set('Authorization', auth).send(body),
  delete: (url: string) => request(app).delete(url).set('Authorization', auth),
});

describe('/api/departments', () => {
  it('adds the twelve built-in departments in one click, only once', async () => {
    const admin = as((await staffOf('ADMIN')).auth);

    const first = await admin.post('/api/departments/defaults');
    const second = await admin.post('/api/departments/defaults');

    expect(first.status).toBe(200);
    expect(first.body.added).toBe(12);
    expect(first.body.departments.map((d: { code: string }) => d.code)).toEqual([
      ...DEPARTMENT_CODES,
    ]);
    expect(first.body.departments[0]).toMatchObject({
      name: 'الإسعاف',
      roomCount: 0,
      staffCount: 0,
    });
    expect(second.body.added).toBe(0);
    expect(second.body.departments).toHaveLength(12);
  });

  it('adds only the missing built-ins and skips names already used', async () => {
    const admin = as((await staffOf('ADMIN')).auth);
    await admin.post('/api/departments', { name: 'القلبية' }); // custom, same name as a built-in

    const res = await admin.post('/api/departments/defaults');

    expect(res.body.added).toBe(11);
    expect(res.body.departments).toHaveLength(12);
    const cardiology = res.body.departments.find((d: { name: string }) => d.name === 'القلبية');
    expect(cardiology.code).toBeNull();
  });

  it('creates, renames and deletes custom departments; names stay unique', async () => {
    const admin = as((await staffOf('ADMIN')).auth);

    const created = await admin.post('/api/departments', { name: '  الأطفال ' });
    expect(created.status).toBe(201);
    expect(created.body.department).toMatchObject({ name: 'الأطفال', code: null });
    const id = created.body.department.id;

    const duplicate = await admin.post('/api/departments', { name: 'الأطفال' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DEPARTMENT_EXISTS');

    const renamed = await admin.patch(`/api/departments/${id}`, { name: 'طب الأطفال' });
    expect(renamed.body.department.name).toBe('طب الأطفال');

    expect((await admin.delete(`/api/departments/${id}`)).status).toBe(204);
    expect((await admin.get('/api/departments')).body.departments).toEqual([]);
  });

  it('keeps built-in names (translated by code) but lets them be deleted', async () => {
    const admin = as((await staffOf('ADMIN')).auth);
    const { departments } = (await admin.post('/api/departments/defaults')).body;
    const er = departments[0];

    expect((await admin.patch(`/api/departments/${er.id}`, { name: 'X' })).status).toBe(403);
    expect((await admin.delete(`/api/departments/${er.id}`)).status).toBe(204);
  });

  it('refuses to delete a department that still has rooms or staff', async () => {
    const { hospitalId, auth } = await staffOf('ADMIN');
    const admin = as(auth);
    const { department } = (await admin.post('/api/departments', { name: 'الأطفال' })).body;
    await prisma.room.create({ data: { hospitalId, departmentId: department.id, number: '101' } });

    const res = await admin.delete(`/api/departments/${department.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'DEPARTMENT_IN_USE',
      details: { roomCount: 1, staffCount: 0 },
    });
    expect((await admin.get('/api/departments')).body.departments[0].roomCount).toBe(1);
  });

  it('lets any staff member list them, but only the admin change them', async () => {
    const adminInfo = await staffOf('ADMIN');
    const doctor = as((await staffOf('DOCTOR', adminInfo.hospitalId)).auth);
    await as(adminInfo.auth).post('/api/departments/defaults');

    expect((await doctor.get('/api/departments')).body.departments).toHaveLength(12);
    expect((await doctor.post('/api/departments', { name: 'X' })).status).toBe(403);
    expect((await doctor.post('/api/departments/defaults')).status).toBe(403);
  });

  it("never shows or touches another hospital's departments", async () => {
    const mine = as((await staffOf('ADMIN')).auth);
    const other = as((await staffOf('ADMIN')).auth);
    const { department } = (await other.post('/api/departments', { name: 'سرّي' })).body;

    expect((await mine.get('/api/departments')).body.departments).toEqual([]);
    expect((await mine.patch(`/api/departments/${department.id}`, { name: 'x' })).status).toBe(404);
    expect((await mine.delete(`/api/departments/${department.id}`)).status).toBe(404);
    // Same name in two hospitals is fine.
    expect((await mine.post('/api/departments', { name: 'سرّي' })).status).toBe(201);
  });

  it('validates names and ids', async () => {
    const admin = as((await staffOf('ADMIN')).auth);
    expect((await admin.post('/api/departments', { name: '   ' })).status).toBe(400);
    expect((await admin.patch('/api/departments/not-a-uuid', { name: 'x' })).status).toBe(400);
  });
});
