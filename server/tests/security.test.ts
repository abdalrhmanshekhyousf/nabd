import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

/** Every route the API serves: each router module, at the prefix app.ts mounts it on. */
async function allRoutes() {
  const source = readFileSync(fileURLToPath(new URL('../src/app.ts', import.meta.url)), 'utf8');
  const imports = new Map(
    [...source.matchAll(/import \{ ([\w, ]+) \} from '(\.\/routes\/[\w.]+)';/g)].flatMap((m) =>
      m[1]!.split(',').map((name) => [name.trim(), m[2]!] as const),
    ),
  );
  const routes: { method: string; path: string; prefix: string }[] = [];
  for (const [, prefix, name] of source.matchAll(/app\.use\('(\/api[^']*)', (\w+Router)\)/g)) {
    const module = (await import(
      `../src/${imports.get(name!)!.slice(2).replace('.js', '.ts')}`
    )) as Record<string, Router>;
    for (const layer of module[name!]!.stack as Layer[]) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method, path: `${prefix}${layer.route.path}`, prefix: prefix! });
      }
    }
  }
  return routes;
}

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
