import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { verifyAccessToken } from '../src/lib/tokens.js';
import { createHospital } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function hospital(name?: string) {
  const created = await createHospital(name);
  hospitalIds.push(created.id);
  return created;
}

function patient(hospitalId: string, overrides: Record<string, unknown> = {}) {
  return {
    hospitalId,
    fullName: 'سارة الأحمد',
    phone: '0991 234 567',
    gender: 'FEMALE',
    dateOfBirth: '1990-05-17',
    email: `Sara-${crypto.randomUUID()}@Mail.Test`,
    password: 'Strong1234',
    ...overrides,
  };
}

const signUp = (body: object) => request(app).post('/api/auth/register/patient').send(body);

describe('POST /api/auth/register/patient', () => {
  it('opens a patient account with its record and signs the patient in', async () => {
    const { id } = await hospital();
    const body = patient(id);

    const res = await signUp(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      role: 'PATIENT',
      fullName: 'سارة الأحمد',
      email: body.email.toLowerCase(),
      hospital: { id },
    });
    expect(verifyAccessToken(res.body.accessToken)).toMatchObject({
      role: 'PATIENT',
      hospitalId: id,
    });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^nabd_refresh=/);

    const record = await prisma.patient.findFirst({
      where: { user: { email: body.email.toLowerCase() } },
    });
    expect(record).toMatchObject({
      hospitalId: id,
      fullName: 'سارة الأحمد',
      phone: '0991 234 567',
      gender: 'FEMALE',
      isAnonymous: false,
    });
    expect(record?.dateOfBirth?.toISOString().slice(0, 10)).toBe('1990-05-17');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: 'Strong1234' });
    expect(login.status).toBe(200);
  });

  it('lets the same email open an account at another hospital, but not twice at one', async () => {
    const first = await hospital();
    const second = await hospital();
    const email = `twice-${crypto.randomUUID()}@mail.test`;

    expect((await signUp(patient(first.id, { email }))).status).toBe(201);
    expect((await signUp(patient(second.id, { email }))).status).toBe(201);
    const again = await signUp(patient(first.id, { email }));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.patient.count({ where: { hospitalId: first.id } })).toBe(1);
  });

  it('refuses an unknown hospital and invalid details', async () => {
    const unknown = await signUp(patient('0199a3d2-6c55-7000-8000-00000000ffff'));
    expect(unknown.status).toBe(404);

    const { id } = await hospital();
    const invalid = await signUp(patient(id, { gender: 'X', dateOfBirth: '2999-01-01' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cannot be used to create staff', async () => {
    const { id } = await hospital();
    const res = await signUp({ ...patient(id), role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PATIENT');
  });
});

describe('GET /api/public/hospitals', () => {
  it('lists hospitals by name without contact details, and searches', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const dar = await hospital(`دار الشفاء ${tag}`);
    await hospital(`مشفى الأمل ${tag}`);

    const all = await request(app).get(`/api/public/hospitals?search=${encodeURIComponent(tag)}`);
    expect(all.status).toBe(200);
    expect(all.body.hospitals).toHaveLength(2);
    expect(Object.keys(all.body.hospitals[0]).sort()).toEqual(['address', 'id', 'name']);

    const found = await request(app).get(
      `/api/public/hospitals?search=${encodeURIComponent(`دار الشفاء ${tag}`)}`,
    );
    expect(found.body.hospitals).toEqual([{ id: dar.id, name: dar.name, address: 'Damascus' }]);
  });
});
