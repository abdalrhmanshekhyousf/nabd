import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LOGO_MAX_BYTES } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { storedPath } from '../src/lib/uploads.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

// A real 1x1 PNG, plus files that only carry the right signature (the server
// judges the type by the first bytes).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(32),
]);

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
    password: 'Strong1234',
    role,
  });
  return {
    hospitalId: id,
    email: user.email,
    auth: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
  };
}

const upload = (auth: string, data: Buffer, filename: string, contentType: string) =>
  request(app)
    .put('/api/hospital/logo')
    .set('Authorization', auth)
    .attach('logo', data, { filename, contentType });

const storedKey = async (hospitalId: string) =>
  (await prisma.hospital.findUnique({ where: { id: hospitalId } }))?.logoUrl ?? null;

const filesOf = async (hospitalId: string) => {
  const folder = join(env.uploadsDir, 'logos', hospitalId);
  return existsSync(folder) ? readdir(folder) : [];
};

describe('hospital logo', () => {
  it('uploads a logo and serves it back to the hospital staff only', async () => {
    const admin = await staffOf('ADMIN');
    const doctor = await staffOf('DOCTOR', admin.hospitalId);

    const res = await upload(admin.auth, PNG, 'logo.png', 'image/png');

    expect(res.status).toBe(200);
    expect(res.body.hospital.logoUrl).toMatch(/^\/hospital\/logo\?v=[0-9a-f-]{36}$/);
    const key = await storedKey(admin.hospitalId);
    expect(key).toMatch(new RegExp(`^logos/${admin.hospitalId}/[0-9a-f-]{36}\\.png$`));
    expect(existsSync(storedPath(key!))).toBe(true);

    // Any signed-in member of the hospital can see it, with safe headers.
    const served = await request(app).get('/api/hospital/logo').set('Authorization', doctor.auth);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);

    // Sign-in responses carry the public route, never the storage key.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: doctor.email, password: 'Strong1234' });
    expect(login.body.user.hospital.logoUrl).toBe(res.body.hospital.logoUrl);
  });

  it('replacing the logo deletes the old file and changes the URL', async () => {
    const admin = await staffOf('ADMIN');
    const first = await upload(admin.auth, PNG, 'a.png', 'image/png');
    const second = await upload(admin.auth, JPEG, 'b.jpg', 'image/jpeg');
    const third = await upload(admin.auth, WEBP, 'c.webp', 'image/webp');

    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(new Set([first, second, third].map((r) => r.body.hospital.logoUrl)).size).toBe(3);
    expect(await filesOf(admin.hospitalId)).toHaveLength(1);
    expect(await storedKey(admin.hospitalId)).toMatch(/\.webp$/);
  });

  it('refuses files that are not really images, whatever their name says', async () => {
    const admin = await staffOf('ADMIN');
    const disguised = Buffer.from('<script>alert(1)</script> definitely a png');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    for (const res of [
      await upload(admin.auth, disguised, 'logo.png', 'image/png'),
      await upload(admin.auth, svg, 'logo.svg', 'image/svg+xml'),
      await upload(admin.auth, PNG, 'logo.png', 'application/octet-stream'),
    ]) {
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(await storedKey(admin.hospitalId)).toBeNull();
    expect(await filesOf(admin.hospitalId)).toHaveLength(0);
  });

  it('refuses files over the size limit and requests without a file', async () => {
    const admin = await staffOf('ADMIN');
    const huge = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);

    const tooBig = await upload(admin.auth, huge, 'big.png', 'image/png');
    const missing = await request(app).put('/api/hospital/logo').set('Authorization', admin.auth);

    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('FILE_REQUIRED');
  });

  it('only the admin changes the logo; other hospitals never see it', async () => {
    const admin = await staffOf('ADMIN');
    const doctor = await staffOf('DOCTOR', admin.hospitalId);
    const outsider = await staffOf('ADMIN');
    await upload(admin.auth, PNG, 'logo.png', 'image/png');

    expect((await upload(doctor.auth, PNG, 'x.png', 'image/png')).status).toBe(403);
    expect(
      (await request(app).delete('/api/hospital/logo').set('Authorization', doctor.auth)).status,
    ).toBe(403);
    // The outsider's own hospital has no logo, and there is no way to ask for another's.
    expect(
      (await request(app).get('/api/hospital/logo').set('Authorization', outsider.auth)).status,
    ).toBe(404);
    expect((await request(app).get('/api/hospital/logo')).status).toBe(401);
  });

  it('removing the logo deletes the file', async () => {
    const admin = await staffOf('ADMIN');
    await upload(admin.auth, PNG, 'logo.png', 'image/png');

    const res = await request(app).delete('/api/hospital/logo').set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.hospital.logoUrl).toBeNull();
    expect(await filesOf(admin.hospitalId)).toHaveLength(0);
    expect(
      (await request(app).get('/api/hospital/logo').set('Authorization', admin.auth)).status,
    ).toBe(404);
  });
});

describe('storedPath', () => {
  it('refuses paths that escape the uploads folder', () => {
    expect(() => storedPath('../secret.txt')).toThrow();
    expect(() => storedPath('logos/../../secret.txt')).toThrow();
    expect(() => storedPath('')).toThrow();
    expect(storedPath('logos/a/b.png')).toBe(join(env.uploadsDir, 'logos', 'a', 'b.png'));
  });
});
