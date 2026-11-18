import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { createHospital, createUser } from './helpers.js';
import { allRoutes } from './routes.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

const PUBLIC_PREFIXES = ['/api/auth', '/api/health', '/api/public'];

describe('security review (task 4.23)', () => {
  it('no route outside sign-in, health and the public pages opens without a token', async () => {
    const routes = await allRoutes();
    expect(routes.length).toBeGreaterThan(100);
    const open: string[] = [];
    for (const route of routes) {
      if (PUBLIC_PREFIXES.includes(route.prefix)) continue;
      const path = route.path.replace(/:\w+/g, crypto.randomUUID());
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[
        route.method
      ]!(path);
      if (res.status !== 401)
        open.push(`${route.method.toUpperCase()} ${route.path} → ${res.status}`);
    }
    expect(open).toEqual([]);
  }, 120_000);

  it("one hospital's staff cannot reach another hospital's patients", async () => {
    const a = await createHospital();
    const b = await createHospital();
    hospitalIds.push(a.id, b.id);
    const theirs = await prisma.patient.create({
      data: {
        hospitalId: b.id,
        fullName: 'مريض مستشفى تاني',
        medicalRecord: { create: { hospitalId: b.id } },
      },
    });
    const as = async (role: 'DOCTOR' | 'ACCOUNTANT' | 'RECEPTIONIST' | 'ADMIN') => {
      const user = await createUser(a.id, {
        email: `${role}-${crypto.randomUUID()}@nabd.test`,
        password: 'x',
        role,
      });
      return {
        Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: a.id, role })}`,
      };
    };
    const tries: [string, Awaited<ReturnType<typeof as>>][] = [
      [`/api/doctors/me/patients/${theirs.id}`, await as('DOCTOR')],
      [`/api/invoices/accounts/${theirs.id}`, await as('ACCOUNTANT')],
      [`/api/appointments/patient/${theirs.id}`, await as('RECEPTIONIST')],
    ];
    for (const [path, auth] of tries) {
      const res = await request(app).get(path).set(auth);
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain('مريض مستشفى تاني');
    }
    // Lists never show them either.
    const search = await request(app)
      .get('/api/reception/patients')
      .query({ search: 'مستشفى تاني' })
      .set(await as('RECEPTIONIST'));
    expect(search.body.patients).toEqual([]);
  });

  it('too many sign-in tries are refused for a while', async () => {
    const limited = express();
    limited.use(express.json());
    limited.post(
      '/try',
      rateLimit({ max: 3, windowMs: 60_000, key: (req) => String(req.body.email) }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    limited.use(errorHandler);
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(limited).post('/try').send({ email: 'x@y.z' })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    // Someone else is not held back.
    expect((await request(limited).post('/try').send({ email: 'other@y.z' })).status).toBe(200);
  });
});
