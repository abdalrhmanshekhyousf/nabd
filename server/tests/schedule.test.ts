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
  async function person(role: 'DOCTOR' | 'ADMIN' | 'NURSE') {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    if (role === 'DOCTOR') {
      await prisma.doctorProfile.create({
        data: { hospitalId: id, userId: user.id, specialty: 'قلبية' },
      });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      mine: () => request(app).get('/api/doctors/me/schedule').set(auth),
      visit: (visitMinutes: number) =>
        request(app).put('/api/doctors/me/visit-length').set(auth).send({ visitMinutes }),
      of: (doctorId: string) => request(app).get(`/api/staff/${doctorId}/schedule`).set(auth),
      set: (doctorId: string, days: object[]) =>
        request(app).put(`/api/staff/${doctorId}/schedule`).set(auth).send({ days }),
    };
  }
  return { id, person };
}

const sat = { weekday: 6, startMinute: 8 * 60, endMinute: 14 * 60 };
const mon = { weekday: 1, startMinute: 16 * 60, endMinute: 20 * 60 };

describe('doctor schedule (task 3.19)', () => {
  it('the admin sets the days and hours; the doctor sees them', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const sami = await h.person('DOCTOR');
    expect((await sami.mine()).body).toEqual({ days: [], visitMinutes: 20, vacations: [] });

    const saved = await admin.set(sami.id, [sat, mon]);
    expect(saved.status).toBe(200);
    expect(saved.body.days).toEqual([mon, sat]);
    expect((await sami.mine()).body.days).toEqual([mon, sat]);

    // Monday moves to the morning, Saturday is dropped, Wednesday added.
    const wed = { weekday: 3, startMinute: 9 * 60, endMinute: 13 * 60 };
    const next = await admin.set(sami.id, [{ ...mon, startMinute: 480, endMinute: 720 }, wed]);
    expect(next.body.days).toEqual([{ ...mon, startMinute: 480, endMinute: 720 }, wed]);
    expect((await admin.of(sami.id)).body.days).toHaveLength(2);
    expect((await admin.set(sami.id, [])).body.days).toEqual([]);
  });

  it('the doctor chooses the visit length, and only that', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const sami = await h.person('DOCTOR');
    await admin.set(sami.id, [sat]);
    expect((await sami.visit(30)).body).toEqual({ days: [sat], visitMinutes: 30, vacations: [] });
    expect((await sami.visit(25)).status).toBe(400);
    // The doctor cannot set their own hours.
    expect((await sami.set(sami.id, [mon])).status).toBe(403);
    expect((await admin.of(sami.id)).body.visitMinutes).toBe(30);
  });

  it('refuses impossible hours, and only for doctors of this hospital', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN');
    const sami = await h.person('DOCTOR');
    const nurse = await h.person('NURSE');
    expect((await admin.set(sami.id, [{ ...sat, endMinute: 7 * 60 }])).status).toBe(400);
    expect((await admin.set(sami.id, [sat, sat])).status).toBe(400);
    expect((await admin.set(sami.id, [{ ...sat, startMinute: 481 }])).status).toBe(400);
    expect((await admin.set(nurse.id, [sat])).status).toBe(404);
    const other = await hospital();
    const otherAdmin = await other.person('ADMIN');
    expect((await otherAdmin.set(sami.id, [sat])).status).toBe(404);
    expect((await sami.mine()).body.days).toEqual([]);
  });

  it('the database itself refuses a schedule that makes no sense', async () => {
    const h = await hospital();
    const sami = await h.person('DOCTOR');
    await expect(
      prisma.doctorSchedule.create({
        data: { hospitalId: h.id, doctorId: sami.id, weekday: 9, startMinute: 0, endMinute: 60 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.doctorProfile.update({ where: { userId: sami.id }, data: { visitMinutes: 1000 } }),
    ).rejects.toThrow();
  });
});
