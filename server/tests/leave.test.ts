import { addLocalDays, zonedDate } from '@nabd/shared';
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

const today = zonedDate(new Date());

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const person = async (role: string) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: role as never,
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: role as never })}`,
    };
    return {
      id: user.id,
      ask: (body: object) => request(app).post('/api/leave').set(auth).send(body),
      mine: () => request(app).get('/api/leave/mine').set(auth),
      cancel: (requestId: string) => request(app).delete(`/api/leave/${requestId}`).set(auth),
    };
  };
  return { id, person };
}

describe('leave requests (task 4.5)', () => {
  it('a nurse asks for days off; the admins are told; they withdraw it while pending', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const nurse = await h.person('NURSE');
    const from = addLocalDays(today, 3);
    const to = addLocalDays(today, 5);

    const asked = await nurse.ask({ from, to, reason: 'سفر' });
    expect(asked.status).toBe(201);
    expect(asked.body.request).toMatchObject({ from, to, days: 3, status: 'PENDING' });
    const told = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(told.map((n) => n.type)).toEqual(['LEAVE_REQUEST']);

    // The same days again: refused.
    const again = await nurse.ask({ from: to, to: addLocalDays(to, 1), reason: 'x' });
    expect(again.body.error.code).toBe('LEAVE_OVERLAP');
    // Not in the past, nor ending before it starts.
    expect(
      (await nurse.ask({ from: addLocalDays(today, -1), to: today, reason: 'x' })).status,
    ).toBe(400);
    expect((await nurse.ask({ from: to, to: from, reason: 'x' })).status).toBe(400);

    expect((await nurse.mine()).body.requests).toHaveLength(1);
    const cancelled = await nurse.cancel(asked.body.request.id);
    expect(cancelled.body.request.status).toBe('CANCELLED');
    expect((await nurse.cancel(asked.body.request.id)).body.error.code).toBe('INVALID_TRANSITION');
    // Another person's request is not theirs to withdraw.
    const doctor = await h.person('DOCTOR');
    const theirs = (await doctor.ask({ from, to, reason: 'مؤتمر' })).body.request;
    expect((await nurse.cancel(theirs.id)).status).toBe(404);
    // Withdrawn days can be asked again.
    expect((await nurse.ask({ from, to, reason: 'سفر' })).status).toBe(201);
  });

  it('is for staff, not patients', async () => {
    const h = await hospital();
    const patient = await h.person('PATIENT');
    expect((await patient.mine()).status).toBe(403);
  });
});
