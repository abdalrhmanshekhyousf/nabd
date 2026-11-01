import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { authenticate, requireRole, session } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { prisma } from '../src/lib/prisma.js';
import { CrossHospitalWriteError, forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

async function hospital() {
  const created = await createHospital();
  hospitalIds.push(created.id);
  return created;
}

async function signedInUser(role: 'ADMIN' | 'DOCTOR' = 'ADMIN') {
  const h = await hospital();
  const user = await createUser(h.id, {
    email: `u-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const token = signAccessToken({ sub: user.id, hospitalId: h.id, role });
  return { hospital: h, user, token };
}

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('authenticate', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects malformed, forged and expired tokens', async () => {
    const { user, hospital: h } = await signedInUser();
    const payload = { sub: user.id, hospitalId: h.id, role: 'ADMIN' };
    const forged = jwt.sign(payload, 'another-secret-that-is-also-long-enough!!');
    const expired = jwt.sign(payload, env.jwtAccessSecret, { expiresIn: -10 });

    for (const header of ['Token abc', 'Bearer', `Bearer ${forged}`, `Bearer ${expired}`]) {
      const res = await request(app).get('/api/me').set('Authorization', header);
      expect(res.status, header.slice(0, 12)).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('accepts a valid token and serves the caller', async () => {
    const { user, hospital: h, token } = await signedInUser('DOCTOR');

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'DOCTOR', hospital: { id: h.id } });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });
});

describe('PATCH /api/me/preferences', () => {
  it('saves language and display mode to the account', async () => {
    const { user, token } = await signedInUser();

    const res = await request(app)
      .patch('/api/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'EN', theme: 'DARK' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ language: 'EN', theme: 'DARK' });
    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved).toMatchObject({ language: 'EN', theme: 'DARK' });
  });

  it('rejects empty, unknown or invalid values', async () => {
    const { token } = await signedInUser();
    for (const body of [{}, { theme: 'PURPLE' }, { role: 'ADMIN' }]) {
      const res = await request(app)
        .patch('/api/me/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('requireRole', () => {
  const guarded = express()
    .get('/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
      res.json({ role: session(req).auth.role });
    })
    .use(errorHandler);

  it('lets allowed roles through and refuses the rest with 403', async () => {
    const admin = await signedInUser('ADMIN');
    const doctor = await signedInUser('DOCTOR');

    const ok = await request(guarded)
      .get('/admin-only')
      .set('Authorization', `Bearer ${admin.token}`);
    const no = await request(guarded)
      .get('/admin-only')
      .set('Authorization', `Bearer ${doctor.token}`);

    expect(ok.status).toBe(200);
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('FORBIDDEN');
  });
});

describe('hospital-scoped database (forHospital)', () => {
  async function twoHospitals() {
    const [a, b] = [await hospital(), await hospital()];
    const deptA = await prisma.department.create({ data: { hospitalId: a.id, name: 'ER' } });
    const deptB = await prisma.department.create({ data: { hospitalId: b.id, name: 'ER' } });
    return { a, b, deptA, deptB, db: forHospital(a.id) };
  }

  it('only reads its own hospital', async () => {
    const { a, deptA, deptB, db } = await twoHospitals();

    expect((await db.department.findMany()).map((d) => d.id)).toEqual([deptA.id]);
    expect(await db.department.findUnique({ where: { id: deptB.id } })).toBeNull();
    expect(await db.department.findFirst({ where: { name: 'ER' } })).toMatchObject({
      id: deptA.id,
    });
    expect(await db.department.count()).toBe(1);
    const grouped = await db.department.groupBy({ by: ['hospitalId'], _count: true });
    expect(grouped).toEqual([{ hospitalId: a.id, _count: 1 }]);
  });

  it("cannot update or delete another hospital's rows", async () => {
    const { deptB, db } = await twoHospitals();

    await expect(
      db.department.update({ where: { id: deptB.id }, data: { name: 'Hacked' } }),
    ).rejects.toMatchObject({ code: 'P2025' });
    await expect(db.department.delete({ where: { id: deptB.id } })).rejects.toMatchObject({
      code: 'P2025',
    });
    expect((await db.department.updateMany({ data: { name: 'Renamed' } })).count).toBe(1);
    expect((await db.department.deleteMany()).count).toBe(1);

    const untouched = await prisma.department.findUnique({ where: { id: deptB.id } });
    expect(untouched?.name).toBe('ER');
  });

  it('stamps its hospital on new rows and refuses writes for another hospital', async () => {
    const { a, b, db } = await twoHospitals();

    const created = await db.department.create({ data: { name: 'Cardiology' } as never });
    expect(created.hospitalId).toBe(a.id);
    const many = await db.room.createManyAndReturn({
      data: [{ departmentId: created.id, number: '1' }] as never,
    });
    expect(many[0].hospitalId).toBe(a.id);

    await expect(
      db.department.create({ data: { name: 'X', hospitalId: b.id } }),
    ).rejects.toBeInstanceOf(CrossHospitalWriteError);
    await expect(
      db.department.update({ where: { id: created.id }, data: { hospitalId: b.id } }),
    ).rejects.toBeInstanceOf(CrossHospitalWriteError);
  });

  it('sees only its own Hospital record and cannot create hospitals', async () => {
    const { a, b, db } = await twoHospitals();

    expect((await db.hospital.findMany()).map((h) => h.id)).toEqual([a.id]);
    expect(await db.hospital.findUnique({ where: { id: b.id } })).toBeNull();
    await expect(
      db.hospital.create({ data: { name: 'New', address: 'x', phone: 'x' } }),
    ).rejects.toBeInstanceOf(CrossHospitalWriteError);
  });

  it("protects /api routes end to end: a user cannot fetch another hospital's user", async () => {
    const mine = await signedInUser();
    const other = await signedInUser();
    // A token claiming hospital A but naming a user of hospital B finds nothing.
    const crossToken = signAccessToken({
      sub: other.user.id,
      hospitalId: mine.hospital.id,
      role: 'ADMIN',
    });

    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${crossToken}`);

    expect(res.status).toBe(404);
  });
});
