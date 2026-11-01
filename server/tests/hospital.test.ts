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

function registration(overrides: { email?: string; password?: string } = {}) {
  return {
    hospital: {
      name: `مستشفى الأمل ${crypto.randomUUID().slice(0, 6)}`,
      address: 'حلب، شارع النيل',
      phone: '+963 21 123 4567',
      email: '',
    },
    admin: {
      fullName: 'سارة الأحمد',
      email: overrides.email ?? `Sara-${crypto.randomUUID()}@Amal.Org`,
      password: overrides.password ?? 'Strong1234',
    },
  };
}

describe('POST /api/auth/register', () => {
  it('creates the hospital and its admin, and signs the admin in', async () => {
    const body = registration();

    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    hospitalIds.push(res.body.user.hospital.id);
    expect(res.body.user).toMatchObject({
      role: 'ADMIN',
      fullName: 'سارة الأحمد',
      email: body.admin.email.toLowerCase(),
      hospital: { name: body.hospital.name },
    });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^nabd_refresh=/);

    const saved = await prisma.hospital.findUnique({
      where: { id: res.body.user.hospital.id },
      include: { users: { include: { staffProfile: true } } },
    });
    expect(saved).toMatchObject({ address: 'حلب، شارع النيل', email: null });
    expect(saved?.users).toHaveLength(1);
    expect(saved?.users[0].staffProfile?.hospitalId).toBe(saved?.id);

    // The new admin can use the API straight away, and sign in again later.
    const me = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.body.user.role).toBe('ADMIN');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.admin.email, password: 'Strong1234' });
    expect(login.status).toBe(200);
  });

  it('accepts exactly what the sign-up form sends (empty email as null)', async () => {
    const body = registration();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...body, hospital: { ...body.hospital, email: null } });

    expect(res.status).toBe(201);
    hospitalIds.push(res.body.user.hospital.id);
  });

  it('rejects weak passwords and bad details with translation keys', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        ...registration({ password: 'short' }),
        hospital: { name: '', address: 'x', phone: 'call me', email: 'nope' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const messages = res.body.error.details.map((d: { message: string }) => d.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'validation.required',
        'validation.phoneInvalid',
        'validation.emailInvalid',
        'validation.passwordTooShort',
      ]),
    );
    expect(await prisma.hospital.count({ where: { name: '' } })).toBe(0);
  });
});

describe('/api/hospital', () => {
  async function staffOf(role: 'ADMIN' | 'DOCTOR') {
    const hospital = await createHospital();
    hospitalIds.push(hospital.id);
    const user = await createUser(hospital.id, {
      email: `${role.toLowerCase()}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    const token = signAccessToken({ sub: user.id, hospitalId: hospital.id, role });
    return { hospital, token };
  }

  const info = {
    name: 'مستشفى الشفاء',
    address: 'دمشق',
    phone: '011-2233445',
    email: 'info@shifa.sy',
  };

  it('anyone signed in reads their own hospital', async () => {
    const { hospital, token } = await staffOf('DOCTOR');

    const res = await request(app).get('/api/hospital').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.hospital).toMatchObject({ id: hospital.id, name: hospital.name });
  });

  it('only the admin edits it', async () => {
    const doctor = await staffOf('DOCTOR');
    const admin = await staffOf('ADMIN');

    const refused = await request(app)
      .patch('/api/hospital')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send(info);
    const saved = await request(app)
      .patch('/api/hospital')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(info);

    expect(refused.status).toBe(403);
    expect(saved.status).toBe(200);
    expect(saved.body.hospital).toMatchObject({ ...info, id: admin.hospital.id });
    // The other hospital is untouched.
    expect((await prisma.hospital.findUnique({ where: { id: doctor.hospital.id } }))?.name).toBe(
      doctor.hospital.name,
    );
  });

  it('validates the details', async () => {
    const { token } = await staffOf('ADMIN');

    const res = await request(app)
      .patch('/api/hospital')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...info, phone: 'abc' });

    expect(res.status).toBe(400);
  });
});
