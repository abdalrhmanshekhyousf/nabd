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

async function hospital() {
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

const inTwoDays = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

describe('meetings (task 4.10)', () => {
  it('the admin asks a doctor to meet; the doctor accepts; the admin is told', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const doctor = await h.person('DOCTOR');
    const nurse = await h.person('NURSE');
    const startsAt = inTwoDays();
    const called = await request(app)
      .post('/api/meetings')
      .set(admin.auth)
      .send({ doctorId: doctor.id, startsAt, topic: 'جدول المناوبات' });
    expect(called.status).toBe(201);
    expect(called.body.meeting).toMatchObject({ status: 'REQUESTED', topic: 'جدول المناوبات' });
    expect(
      (await prisma.notification.findMany({ where: { userId: doctor.id } })).map((n) => n.type),
    ).toEqual(['MEETING_REQUEST']);
    // Only doctors, and not in the past.
    expect(
      (
        await request(app)
          .post('/api/meetings')
          .set(admin.auth)
          .send({ doctorId: nurse.id, startsAt, topic: 'x' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/meetings')
          .set(admin.auth)
          .send({
            doctorId: doctor.id,
            startsAt: new Date(Date.now() - 60_000).toISOString(),
            topic: 'x',
          })
      ).status,
    ).toBe(400);

    const mine = (await request(app).get('/api/meetings/mine').set(doctor.auth)).body.meetings;
    expect(mine).toHaveLength(1);
    const answered = await request(app)
      .post(`/api/meetings/${mine[0].id}/answer`)
      .set(doctor.auth)
      .send({ answer: 'ACCEPTED', response: 'تمام' });
    expect(answered.body.meeting).toMatchObject({ status: 'ACCEPTED', response: 'تمام' });
    expect(
      (await prisma.notification.findMany({ where: { userId: admin.id } })).map((n) => n.type),
    ).toEqual(['REQUEST_DECIDED']);
    const list = (await request(app).get('/api/meetings').set(admin.auth)).body;
    expect(list.upcoming[0].status).toBe('ACCEPTED');

    // Called off: the doctor can no longer answer it.
    const cancelled = await request(app).delete(`/api/meetings/${mine[0].id}`).set(admin.auth);
    expect(cancelled.body.meeting.status).toBe('CANCELLED');
    expect(
      (
        await request(app)
          .post(`/api/meetings/${mine[0].id}/answer`)
          .set(doctor.auth)
          .send({ answer: 'DECLINED' })
      ).status,
    ).toBe(404);
  });

  it('a doctor answers only their own meetings', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const doctor = await h.person('DOCTOR');
    const other = await h.person('DOCTOR');
    const meeting = (
      await request(app)
        .post('/api/meetings')
        .set(admin.auth)
        .send({ doctorId: doctor.id, startsAt: inTwoDays(), topic: 'x' })
    ).body.meeting;
    expect(
      (
        await request(app)
          .post(`/api/meetings/${meeting.id}/answer`)
          .set(other.auth)
          .send({ answer: 'ACCEPTED' })
      ).status,
    ).toBe(404);
    expect((await request(app).get('/api/meetings').set(doctor.auth)).status).toBe(403);
  });
});
