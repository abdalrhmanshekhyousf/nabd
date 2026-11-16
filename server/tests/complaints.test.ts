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

async function complaintsHospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const person = async (role: string) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: role as never,
    });
    return {
      id: user.id,
      auth: {
        Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: role as never })}`,
      },
    };
  };
  return { id, person };
}

describe('patient complaints (task 4.8)', () => {
  it('a patient complains, maybe about a department; the admins are told', async () => {
    const h = await complaintsHospital();
    const admin = await h.person('ADMIN');
    const patient = await h.person('PATIENT');
    const other = await h.person('PATIENT');
    const ward = await prisma.department.create({
      data: { hospitalId: h.id, name: 'الداخلية', code: 'INTERNAL_MEDICINE' },
    });
    const filed = await request(app)
      .post('/api/complaints')
      .set(patient.auth)
      .send({ departmentId: ward.id, subject: 'تأخير', body: 'استنيت ساعتين' });
    expect(filed.status).toBe(201);
    expect(filed.body.complaint).toMatchObject({
      status: 'OPEN',
      department: { code: 'INTERNAL_MEDICINE' },
    });
    expect(
      (await prisma.notification.findMany({ where: { userId: admin.id } })).map((n) => n.type),
    ).toEqual(['COMPLAINT']);
    expect(
      (await request(app).get('/api/complaints/mine').set(patient.auth)).body.complaints,
    ).toHaveLength(1);
    expect(
      (await request(app).get('/api/complaints/mine').set(other.auth)).body.complaints,
    ).toEqual([]);
    expect(
      (await request(app).post('/api/complaints').set(patient.auth).send({ subject: '', body: '' }))
        .status,
    ).toBe(400);
  });

  it('is for patients', async () => {
    const h = await complaintsHospital();
    const nurse = await h.person('NURSE');
    expect(
      (await request(app).post('/api/complaints').set(nurse.auth).send({ subject: 'x', body: 'y' }))
        .status,
    ).toBe(403);
  });
});

describe('the admin answers complaints (task 4.9)', () => {
  it('lists the open ones, answers, and the patient reads the answer', async () => {
    const h = await complaintsHospital();
    const admin = await h.person('ADMIN');
    const patient = await h.person('PATIENT');
    const filed = (
      await request(app)
        .post('/api/complaints')
        .set(patient.auth)
        .send({ subject: 'تأخير', body: 'ساعتين' })
    ).body.complaint;
    const open = (await request(app).get('/api/complaints').set(admin.auth)).body.complaints;
    expect(open.map((c: { id: string }) => c.id)).toEqual([filed.id]);
    expect(
      (
        await request(app)
          .post('/api/complaints/' + filed.id + '/reply')
          .set(admin.auth)
          .send({ reply: '' })
      ).status,
    ).toBe(400);
    const answered = await request(app)
      .post('/api/complaints/' + filed.id + '/reply')
      .set(admin.auth)
      .send({ reply: 'آسفين، تابعنا الموضوع' });
    expect(answered.body.complaint).toMatchObject({
      status: 'ANSWERED',
      reply: 'آسفين، تابعنا الموضوع',
    });
    expect((await request(app).get('/api/complaints').set(admin.auth)).body.complaints).toEqual([]);
    expect(
      (await request(app).get('/api/complaints?status=DONE').set(admin.auth)).body.complaints,
    ).toHaveLength(1);
    const mine = (await request(app).get('/api/complaints/mine').set(patient.auth)).body.complaints;
    expect(mine[0].reply).toBe('آسفين، تابعنا الموضوع');
    expect(
      (await prisma.notification.findMany({ where: { userId: patient.id } })).map((n) => n.type),
    ).toEqual(['REQUEST_DECIDED']);
    expect((await request(app).get('/api/complaints').set(patient.auth)).status).toBe(403);
  });
});
