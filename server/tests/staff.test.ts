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

describe('GET /api/staff filters', () => {
  it('searches name, email and phone, and filters by role and department', async () => {
    const admin = await as('ADMIN');
    await admin.post(
      '/api/staff',
      employee({ fullName: 'لينا خوري', role: 'NURSE', departmentId: admin.departmentId }),
    );
    await admin.post('/api/staff', employee({ fullName: 'Omar Haddad', phone: '0991 222 333' }));
    await admin.post(
      '/api/staff',
      employee({ fullName: 'سامر', email: 'samer.lab@x.co', role: 'LAB_TECHNICIAN' }),
    );

    const names = async (query: string) =>
      (await admin.get(`/api/staff?${query}`)).body.staff.map(
        (s: { fullName: string }) => s.fullName,
      );

    expect(await names(`search=${encodeURIComponent('لينا')}`)).toEqual(['لينا خوري']);
    expect(await names('search=omar')).toEqual(['Omar Haddad']);
    expect(await names('search=222')).toEqual(['Omar Haddad']);
    expect(await names('search=SAMER.LAB')).toEqual(['سامر']);
    expect(await names('role=NURSE')).toEqual(['لينا خوري']);
    expect(await names(`departmentId=${admin.departmentId}`)).toEqual(['لينا خوري']);
    expect((await admin.get('/api/staff?role=ADMIN')).status).toBe(400);
  });
});

describe('PATCH and DELETE /api/staff/:id', () => {
  const update = (overrides: Record<string, unknown>) => ({
    fullName: 'لينا خوري',
    phone: null,
    role: 'NURSE',
    departmentId: null,
    specialty: null,
    radiologyModality: null,
    salary: 900000,
    email: 'lina@amal.org',
    password: '',
    isActive: true,
    ...overrides,
  });

  async function withNurse() {
    const admin = await as('ADMIN');
    const second = await prisma.department.create({
      data: { hospitalId: admin.hospitalId, name: 'القلبية' },
    });
    const { member } = (
      await admin.post(
        '/api/staff',
        employee({ email: 'lina@amal.org', role: 'NURSE', departmentId: admin.departmentId }),
      )
    ).body;
    const auth = `Bearer ${signAccessToken({ sub: 'x', hospitalId: admin.hospitalId, role: 'ADMIN' })}`;
    const patch = (body: object, id = member.id) =>
      request(app).patch(`/api/staff/${id}`).set('Authorization', auth).send(body);
    const remove = (id = member.id) =>
      request(app).delete(`/api/staff/${id}`).set('Authorization', auth);
    return { admin, member, second, patch, remove };
  }

  const login = (password: string) =>
    request(app).post('/api/auth/login').send({ email: 'lina@amal.org', password });

  it('edits details and moves the employee to another department', async () => {
    const { member, second, patch } = await withNurse();

    const res = await patch(
      update({ fullName: 'لينا الخوري', departmentId: second.id, salary: 1100000 }),
    );

    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({
      id: member.id,
      fullName: 'لينا الخوري',
      department: { id: second.id },
      salary: 1100000,
    });
  });

  it('turns a nurse into a doctor and back, keeping the doctor profile in step', async () => {
    const { member, second, patch } = await withNurse();

    const doctor = await patch(
      update({ role: 'DOCTOR', departmentId: second.id, specialty: 'قلبية' }),
    );
    expect(doctor.body.member).toMatchObject({
      role: 'DOCTOR',
      specialty: 'قلبية',
      doctorStatus: 'AVAILABLE',
    });

    const nurse = await patch(
      update({ role: 'NURSE', departmentId: second.id, specialty: 'قلبية' }),
    );
    expect(nurse.body.member).toMatchObject({ role: 'NURSE', specialty: null, doctorStatus: null });
    expect(await prisma.doctorProfile.count({ where: { userId: member.id } })).toBe(0);
  });

  it('a new password replaces the old one and ends open sessions', async () => {
    const { admin, patch } = await withNurse();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'lina@amal.org', password: 'Strong1234' });

    await patch(update({ departmentId: admin.departmentId, password: 'NewPass5678' }));

    expect((await login('Strong1234')).status).toBe(401);
    expect((await login('NewPass5678')).status).toBe(200);
    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
  });

  it('leaving the password empty keeps it', async () => {
    const { admin, patch } = await withNurse();
    await patch(update({ departmentId: admin.departmentId, password: '' }));
    expect((await login('Strong1234')).status).toBe(200);
  });

  it('a suspended employee cannot sign in until reactivated', async () => {
    const { admin, patch } = await withNurse();

    await patch(update({ departmentId: admin.departmentId, isActive: false }));
    const blocked = await login('Strong1234');
    await patch(update({ departmentId: admin.departmentId, isActive: true }));

    expect(blocked.body.error.code).toBe('ACCOUNT_DISABLED');
    expect((await login('Strong1234')).status).toBe(200);
  });

  it('refuses an email used by someone else', async () => {
    const { admin, patch } = await withNurse();
    await admin.post('/api/staff', employee({ email: 'taken@amal.org' }));

    const res = await patch(update({ departmentId: admin.departmentId, email: 'taken@amal.org' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('deletes an employee with their login', async () => {
    const { member, remove } = await withNurse();

    expect((await remove()).status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: member.id } })).toBeNull();
    expect((await login('Strong1234')).status).toBe(401);
  });

  it('never touches admins or another hospital', async () => {
    const { admin, patch, remove } = await withNurse();
    const other = await as('ADMIN');
    const theirs = (await other.post('/api/staff', employee())).body.member;
    const adminUser = await prisma.user.findFirst({
      where: { hospitalId: admin.hospitalId, role: 'ADMIN' },
    });

    for (const id of [theirs.id, adminUser!.id]) {
      // Valid data, so the refusal can only come from who the account belongs to.
      expect((await patch(update({ role: 'ACCOUNTANT' }), id)).status).toBe(404);
      expect((await remove(id)).status).toBe(404);
    }
    expect(await prisma.user.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
});
