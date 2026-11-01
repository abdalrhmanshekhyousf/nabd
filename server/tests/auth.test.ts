import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { REFRESH_COOKIE } from '../src/controllers/auth.controller.js';
import { prisma } from '../src/lib/prisma.js';
import { hashToken, verifyAccessToken } from '../src/lib/tokens.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];
const PASSWORD = 'Correct@Horse1';

async function hospital() {
  const created = await createHospital();
  hospitalIds.push(created.id);
  return created;
}

function uniqueEmail() {
  return `user-${crypto.randomUUID()}@nabd.test`;
}

/** The raw refresh token from a response's Set-Cookie header. */
function refreshCookie(res: request.Response) {
  const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = header.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  return { header: cookie, value: cookie?.split(';')[0].split('=')[1] };
}

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('signs in with a short access token and an httpOnly refresh cookie', async () => {
    const h = await hospital();
    const email = uniqueEmail();
    const user = await createUser(h.id, { email, password: PASSWORD, role: 'DOCTOR' });

    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email,
      role: 'DOCTOR',
      language: 'AR',
      hospital: { id: h.id, name: h.name },
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.expiresIn).toBe(900);
    expect(verifyAccessToken(res.body.accessToken)).toEqual({
      sub: user.id,
      hospitalId: h.id,
      role: 'DOCTOR',
    });

    const cookie = refreshCookie(res);
    expect(cookie.header).toMatch(/HttpOnly/);
    expect(cookie.header).toMatch(/SameSite=Strict/);
    expect(cookie.header).toMatch(/Path=\/api\/auth/);

    // Only the hash is stored, never the token itself.
    const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(hashToken(cookie.value!));
    expect(stored[0].tokenHash).not.toBe(cookie.value);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.lastLoginAt).not.toBeNull();
  });

  it('ignores email case and surrounding spaces', async () => {
    const h = await hospital();
    const email = uniqueEmail();
    await createUser(h.id, { email, password: PASSWORD });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `  ${email.toUpperCase()}`.trimEnd(), password: PASSWORD });

    expect(res.status).toBe(200);
  });

  it('answers the same way for a wrong password and an unknown email', async () => {
    const h = await hospital();
    const email = uniqueEmail();
    await createUser(h.id, { email, password: PASSWORD });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'nope' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: PASSWORD });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(refreshCookie(res).header).toBeUndefined();
    }
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('rejects malformed input with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string[] }) => d.path[0])).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('refuses a disabled account, but only once the password is right', async () => {
    const h = await hospital();
    const email = uniqueEmail();
    await createUser(h.id, { email, password: PASSWORD, isActive: false });

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'nope' });
    const right = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });

    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('asks which hospital when the password matches accounts in several', async () => {
    const [a, b, c] = [await hospital(), await hospital(), await hospital()];
    const email = uniqueEmail();
    await createUser(a.id, { email, password: PASSWORD, role: 'PATIENT' });
    await createUser(b.id, { email, password: PASSWORD, role: 'PATIENT' });
    // Same email, different password: must not be revealed in the list.
    await createUser(c.id, { email, password: 'Other@Pass9', role: 'PATIENT' });

    const ask = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(ask.status).toBe(409);
    expect(ask.body.error.code).toBe('HOSPITAL_REQUIRED');
    expect(ask.body.error.details.hospitals).toHaveLength(2);
    expect(ask.body.error.details.hospitals.map((x: { id: string }) => x.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );

    const chosen = await request(app)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD, hospitalId: b.id });
    expect(chosen.status).toBe(200);
    expect(chosen.body.user.hospital.id).toBe(b.id);
  });

  it('signs straight in when the password matches only one of several accounts', async () => {
    const [a, b] = [await hospital(), await hospital()];
    const email = uniqueEmail();
    await createUser(a.id, { email, password: PASSWORD });
    await createUser(b.id, { email, password: 'Other@Pass9' });

    const res = await request(app).post('/api/auth/login').send({ email, password: 'Other@Pass9' });

    expect(res.status).toBe(200);
    expect(res.body.user.hospital.id).toBe(b.id);
  });
});

describe('POST /api/auth/refresh', () => {
  async function signedIn() {
    const h = await hospital();
    const email = uniqueEmail();
    const user = await createUser(h.id, { email, password: PASSWORD });
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    return { agent, user, firstToken: refreshCookie(res).value! };
  }

  it('rotates: a new access token and a new refresh cookie, the old one revoked', async () => {
    const { agent, user, firstToken } = await signedIn();

    const res = await agent.post('/api/auth/refresh');

    expect(res.status).toBe(200);
    expect(verifyAccessToken(res.body.accessToken).sub).toBe(user.id);
    const secondToken = refreshCookie(res).value!;
    expect(secondToken).not.toBe(firstToken);
    const old = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(firstToken) },
    });
    expect(old?.revokedAt).not.toBeNull();
  });

  it('treats reuse of an old token as theft and ends every session', async () => {
    const { agent, firstToken } = await signedIn();
    await agent.post('/api/auth/refresh'); // legit rotation

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${firstToken}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    // The legitimate, newer session was ended too.
    const legit = await agent.post('/api/auth/refresh');
    expect(legit.status).toBe(401);
  });

  it('rejects a missing or expired token and clears the cookie', async () => {
    const missing = await request(app).post('/api/auth/refresh');
    expect(missing.status).toBe(401);
    expect(refreshCookie(missing).header).toMatch(/Expires=Thu, 01 Jan 1970/);

    const { agent, firstToken } = await signedIn();
    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(firstToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await agent.post('/api/auth/refresh');
    expect(expired.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session: the refresh token stops working and the cookie is cleared', async () => {
    const h = await hospital();
    const email = uniqueEmail();
    await createUser(h.id, { email, password: PASSWORD });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
    const token = refreshCookie(login).value!;

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(refreshCookie(res).header).toMatch(/Expires=Thu, 01 Jan 1970/);

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(stored?.revokedAt).not.toBeNull();
    const after = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${token}`);
    expect(after.status).toBe(401);
  });

  it('is harmless without a session', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
