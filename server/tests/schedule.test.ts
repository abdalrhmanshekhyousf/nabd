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

async function doctor(role: 'DOCTOR' | 'NURSE' = 'DOCTOR') {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const user = await createUser(id, {
    email: `d-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const auth = {
    Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
  };
  return {
    ...user,
    get: () => request(app).get('/api/doctors/me/schedule').set(auth),
    put: (days: object[]) => request(app).put('/api/doctors/me/schedule').set(auth).send({ days }),
  };
}

const sat = { weekday: 6, startMinute: 8 * 60, endMinute: 14 * 60, slotMinutes: 20 };
const mon = { weekday: 1, startMinute: 16 * 60, endMinute: 20 * 60, slotMinutes: 30 };

describe('doctor schedule (task 3.19)', () => {
  it('starts empty, saves the week, and changes or drops days', async () => {
    const sami = await doctor();
    expect((await sami.get()).body.days).toEqual([]);

    const saved = await sami.put([sat, mon]);
    expect(saved.status).toBe(200);
    expect(saved.body.days).toEqual([mon, sat]);

    // Monday moves to the morning, Saturday is dropped, Wednesday added.
    const wed = { weekday: 3, startMinute: 9 * 60, endMinute: 13 * 60, slotMinutes: 15 };
    const next = await sami.put([{ ...mon, startMinute: 8 * 60, endMinute: 12 * 60 }, wed]);
    expect(next.body.days).toEqual([{ ...mon, startMinute: 480, endMinute: 720 }, wed]);
    expect(await prisma.doctorSchedule.count({ where: { doctorId: sami.id } })).toBe(2);

    expect((await sami.put([])).body.days).toEqual([]);
  });

  it('refuses impossible hours, and is the doctor’s own', async () => {
    const sami = await doctor();
    expect((await sami.put([{ ...sat, endMinute: 7 * 60 }])).status).toBe(400);
    expect((await sami.put([{ ...sat, slotMinutes: 600 }])).status).toBe(400);
    expect((await sami.put([sat, sat])).status).toBe(400);
    expect((await sami.get()).body.days).toEqual([]);

    const nurse = await doctor('NURSE');
    expect((await nurse.put([sat])).status).toBe(403);
  });

  it('the database itself refuses a schedule that makes no sense', async () => {
    const sami = await doctor();
    await expect(
      prisma.doctorSchedule.create({
        data: {
          hospitalId: sami.hospitalId,
          doctorId: sami.id,
          weekday: 9,
          startMinute: 0,
          endMinute: 60,
          slotMinutes: 30,
        },
      }),
    ).rejects.toThrow();
  });
});
