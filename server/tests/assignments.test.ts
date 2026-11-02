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

/** A hospital with two departments, a nurse and a cleaner, seen by its admin. */
async function hospital(role: 'ADMIN' | 'NURSE' = 'ADMIN') {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const admin = await createUser(id, {
    email: `admin-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const [er, ward] = await Promise.all(
    ['الإسعاف', 'الداخلية'].map((name) =>
      prisma.department.create({ data: { hospitalId: id, name } }),
    ),
  );
  const nurse = await createUser(id, {
    email: `nurse-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'NURSE',
  });
  await prisma.staffProfile.create({
    data: { hospitalId: id, userId: nurse.id, departmentId: er.id },
  });
  const cleaner = await createUser(id, {
    email: `cleaner-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'CLEANER',
  });
  const auth = `Bearer ${signAccessToken({ sub: admin.id, hospitalId: id, role })}`;
  return {
    id,
    er,
    ward,
    nurse,
    cleaner,
    get: () => request(app).get('/api/assignments').set('Authorization', auth),
    put: (path: string, body: object) =>
      request(app).put(`/api/assignments/${path}`).set('Authorization', auth).send(body),
    staff: (query = '') => request(app).get(`/api/staff${query}`).set('Authorization', auth),
  };
}

describe('GET /api/assignments', () => {
  it('lists departments, nurses with their department and cleaners with theirs', async () => {
    const h = await hospital();

    const res = await h.get();

    expect(res.status).toBe(200);
    expect(res.body.departments.map((d: { name: string }) => d.name).sort()).toEqual(
      ['الإسعاف', 'الداخلية'].sort(),
    );
    expect(res.body.nurses).toEqual([
      expect.objectContaining({ id: h.nurse.id, departmentId: h.er.id, isActive: true }),
    ]);
    expect(res.body.cleaners).toEqual([
      expect.objectContaining({ id: h.cleaner.id, departmentIds: [] }),
    ]);
  });

  it('is for the admin only', async () => {
    const h = await hospital('NURSE');
    expect((await h.get()).status).toBe(403);
  });
});

describe('PUT /api/assignments/nurses/:id', () => {
  it('moves a nurse to another department', async () => {
    const h = await hospital();

    const res = await h.put(`nurses/${h.nurse.id}`, { departmentId: h.ward.id });

    expect(res.status).toBe(200);
    const profile = await prisma.staffProfile.findUnique({ where: { userId: h.nurse.id } });
    expect(profile?.departmentId).toBe(h.ward.id);
  });

  it('refuses a cleaner, an unknown department and another hospital', async () => {
    const h = await hospital();
    const other = await hospital();

    expect((await h.put(`nurses/${h.cleaner.id}`, { departmentId: h.er.id })).status).toBe(404);
    expect((await h.put(`nurses/${h.nurse.id}`, { departmentId: other.er.id })).status).toBe(404);
    expect((await h.put(`nurses/${other.nurse.id}`, { departmentId: h.er.id })).status).toBe(404);
    expect((await h.put(`nurses/${h.nurse.id}`, {})).status).toBe(400);
  });
});

describe('PUT /api/assignments/cleaners/:id', () => {
  it('sets, changes and clears the departments a cleaner covers', async () => {
    const h = await hospital();
    const departmentsOf = async () => (await h.get()).body.cleaners[0].departmentIds.slice().sort();

    await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [h.er.id, h.ward.id, h.er.id] });
    expect(await departmentsOf()).toEqual([h.er.id, h.ward.id].sort());

    await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [h.ward.id] });
    expect(await departmentsOf()).toEqual([h.ward.id]);

    const cleared = await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [] });
    expect(cleared.status).toBe(200);
    expect(await departmentsOf()).toEqual([]);
  });

  it('refuses a nurse and departments of another hospital', async () => {
    const h = await hospital();
    const other = await hospital();

    expect((await h.put(`cleaners/${h.nurse.id}`, { departmentIds: [] })).status).toBe(404);
    const res = await h.put(`cleaners/${h.cleaner.id}`, {
      departmentIds: [h.er.id, other.er.id],
    });
    expect(res.status).toBe(404);
    expect(await prisma.cleanerAssignment.count({ where: { userId: h.cleaner.id } })).toBe(0);
  });

  it('shows up in the staff list and its department filter', async () => {
    const h = await hospital();
    await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [h.ward.id] });

    const all = (await h.staff()).body.staff;
    const cleaner = all.find((s: { id: string }) => s.id === h.cleaner.id);
    expect(cleaner.cleanerDepartments).toEqual([expect.objectContaining({ id: h.ward.id })]);

    const ward = (await h.staff(`?departmentId=${h.ward.id}`)).body.staff;
    expect(ward.map((s: { id: string }) => s.id)).toEqual([h.cleaner.id]);
  });

  it('a department removed later drops out of the cleaner list', async () => {
    const h = await hospital();
    await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [h.er.id, h.ward.id] });

    await prisma.department.delete({ where: { id: h.ward.id } });

    expect((await h.get()).body.cleaners[0].departmentIds).toEqual([h.er.id]);
  });
});

describe('changing a cleaner into another role', () => {
  it('drops their department assignments', async () => {
    const h = await hospital();
    await h.put(`cleaners/${h.cleaner.id}`, { departmentIds: [h.er.id] });

    const auth = `Bearer ${signAccessToken({ sub: 'x', hospitalId: h.id, role: 'ADMIN' })}`;
    const res = await request(app)
      .patch(`/api/staff/${h.cleaner.id}`)
      .set('Authorization', auth)
      .send({
        fullName: 'أبو أحمد',
        phone: null,
        role: 'RECEPTIONIST',
        departmentId: null,
        specialty: null,
        radiologyModality: null,
        salary: 0,
        email: `reception-${crypto.randomUUID()}@nabd.test`,
        password: '',
        isActive: true,
      });

    expect(res.status).toBe(200);
    expect(await prisma.cleanerAssignment.count({ where: { userId: h.cleaner.id } })).toBe(0);
  });
});
