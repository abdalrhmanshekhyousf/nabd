import { STAFF_ROLES } from '@nabd/shared';
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
  const department = await prisma.department.create({
    data: { hospitalId: id, name: `قسم ${crypto.randomUUID().slice(0, 4)}`, code: null },
  });
  return {
    hospitalId: id,
    departmentId: department.id,
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body: object) =>
      request(app).post(url).set('Authorization', auth).send(body),
  };
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'لينا خوري',
    phone: '',
    role: 'ACCOUNTANT',
    departmentId: null,
    specialty: null,
    radiologyModality: null,
    salary: 1250000,
    email: `Staff-${crypto.randomUUID()}@Nabd.Test`,
    password: 'Strong1234',
    ...overrides,
  };
}

describe('POST /api/staff', () => {
  it('adds a doctor with department, specialty and salary, who can then sign in', async () => {
    const admin = await as('ADMIN');
    const body = employee({ role: 'DOCTOR', departmentId: admin.departmentId, specialty: 'قلبية' });

    const res = await admin.post('/api/staff', body);

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      fullName: 'لينا خوري',
      email: body.email.toLowerCase(),
      phone: null,
      role: 'DOCTOR',
      department: { id: admin.departmentId },
      specialty: 'قلبية',
      doctorStatus: 'AVAILABLE',
      salary: 1250000,
    });
    expect(res.body.member).not.toHaveProperty('passwordHash');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: 'Strong1234' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('DOCTOR');
    // The department now counts this employee.
    const departments = (await admin.get('/api/departments')).body.departments;
    expect(departments[0].staffCount).toBe(1);
  });

  it.each(STAFF_ROLES)('can add a %s', async (role) => {
    const admin = await as('ADMIN');
    const res = await admin.post(
      '/api/staff',
      employee({
        role,
        departmentId: ['DOCTOR', 'NURSE'].includes(role) ? admin.departmentId : null,
        specialty: role === 'DOCTOR' ? 'عامة' : null,
        radiologyModality: role === 'RADIOLOGIST' ? 'MRI' : null,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe(role);
    if (role === 'RADIOLOGIST') expect(res.body.member.radiologyModality).toBe('MRI');
  });

  it('checks what each role needs, and refuses admin or patient accounts', async () => {
    const admin = await as('ADMIN');
    const messages = async (body: object) =>
      (await admin.post('/api/staff', body)).body.error.details.map(
        (d: { path: string[]; message: string }) => `${d.path[0]}:${d.message}`,
      );

    expect(await messages(employee({ role: 'DOCTOR' }))).toEqual([
      'departmentId:validation.required',
      'specialty:validation.required',
    ]);
    expect(await messages(employee({ role: 'RADIOLOGIST' }))).toEqual([
      'radiologyModality:validation.required',
    ]);
    expect((await admin.post('/api/staff', employee({ role: 'ADMIN' }))).status).toBe(400);
    expect((await admin.post('/api/staff', employee({ password: 'weak' }))).status).toBe(400);
  });

  it('refuses an email already used in the hospital', async () => {
    const admin = await as('ADMIN');
    const body = employee();
    await admin.post('/api/staff', body);

    const again = await admin.post('/api/staff', employee({ email: body.email }));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
  });

  it("refuses another hospital's department and keeps the list admin-only", async () => {
    const admin = await as('ADMIN');
    const other = await as('ADMIN');
    const doctor = await as('DOCTOR', admin.hospitalId);

    const foreign = await admin.post(
      '/api/staff',
      employee({ role: 'NURSE', departmentId: other.departmentId }),
    );
    expect(foreign.status).toBe(404);
    expect((await doctor.get('/api/staff')).status).toBe(403);
    expect((await doctor.post('/api/staff', employee())).status).toBe(403);
  });
});

describe('GET /api/staff', () => {
  it('lists the employees of the hospital only, newest first, without patients', async () => {
    const admin = await as('ADMIN');
    const other = await as('ADMIN');
    await admin.post('/api/staff', employee({ fullName: 'الأول' }));
    await admin.post('/api/staff', employee({ fullName: 'التاني' }));
    await other.post('/api/staff', employee({ fullName: 'من مستشفى تاني' }));
    await prisma.user.create({
      data: {
        hospitalId: admin.hospitalId,
        role: 'PATIENT',
        email: `p-${crypto.randomUUID()}@x.co`,
        fullName: 'مريض',
        passwordHash: 'x',
      },
    });

    const names = (await admin.get('/api/staff')).body.staff.map(
      (s: { fullName: string }) => s.fullName,
    );

    expect(names.slice(0, 2)).toEqual(['التاني', 'الأول']);
    expect(names).not.toContain('من مستشفى تاني');
    expect(names).not.toContain('مريض');
  });
});
