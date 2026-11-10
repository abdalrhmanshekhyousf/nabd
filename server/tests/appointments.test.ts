import { addLocalDays, zonedDate, zonedInstant } from '@nabd/shared';
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

const tomorrow = addLocalDays(zonedDate(new Date()), 1);
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m).toISOString();
};

async function clinic() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const token = (userId: string, role: string) => ({
    Authorization: `Bearer ${signAccessToken({ sub: userId, hospitalId: id, role: role as never })}`,
  });
  const doctor = await createUser(id, {
    email: `d-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'DOCTOR',
  });
  await prisma.user.update({ where: { id: doctor.id }, data: { fullName: 'د. سامي' } });
  await prisma.doctorProfile.create({
    data: { hospitalId: id, userId: doctor.id, specialty: 'قلبية', visitMinutes: 30 },
  });
  // Every day, 08:00–10:00: four visits of 30 minutes.
  await prisma.doctorSchedule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      hospitalId: id,
      doctorId: doctor.id,
      weekday,
      startMinute: 480,
      endMinute: 600,
    })),
  });
  async function patient(fullName: string) {
    const user = await createUser(id, {
      email: `p-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'PATIENT',
    });
    const record = await prisma.patient.create({
      data: { hospitalId: id, fullName, userId: user.id },
    });
    const auth = token(user.id, 'PATIENT');
    return {
      id: record.id,
      slots: (query: object = {}) =>
        request(app)
          .get('/api/appointments/slots')
          .query({ doctorId: doctor.id, ...query })
          .set(auth),
      book: (startsAt: string, more: object = {}) =>
        request(app)
          .post('/api/appointments')
          .set(auth)
          .send({ doctorId: doctor.id, startsAt, reason: null, ...more }),
    };
  }
  const reception = await createUser(id, {
    email: `r-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'RECEPTIONIST',
  });
  const receptionBook = (body: object) =>
    request(app)
      .post('/api/appointments')
      .set(token(reception.id, 'RECEPTIONIST'))
      .send({ doctorId: doctor.id, reason: null, ...body });
  return { id, doctor, patient, receptionBook };
}

describe('appointments: slots and booking (task 3.20)', () => {
  it('cuts the week into free slots in hospital time and drops booked ones', async () => {
    const h = await clinic();
    const sara = await h.patient('سارة');
    const { body } = await sara.slots({ from: tomorrow, days: 2 });
    expect(body.days.map((d: { date: string }) => d.date)).toEqual([
      tomorrow,
      addLocalDays(tomorrow, 1),
    ]);
    expect(body.days[0].slots).toEqual([
      { startsAt: at(tomorrow, '08:00'), endsAt: at(tomorrow, '08:30') },
      { startsAt: at(tomorrow, '08:30'), endsAt: at(tomorrow, '09:00') },
      { startsAt: at(tomorrow, '09:00'), endsAt: at(tomorrow, '09:30') },
      { startsAt: at(tomorrow, '09:30'), endsAt: at(tomorrow, '10:00') },
    ]);

    const booked = await sara.book(at(tomorrow, '09:00'), { reason: 'خفقان' });
    expect(booked.status).toBe(201);
    expect(booked.body.appointment).toMatchObject({
      doctorName: 'د. سامي',
      patientId: sara.id,
      startsAt: at(tomorrow, '09:00'),
      endsAt: at(tomorrow, '09:30'),
      status: 'BOOKED',
      reason: 'خفقان',
    });
    const after = (await sara.slots({ from: tomorrow, days: 1 })).body.days[0].slots;
    expect(after.map((s: { startsAt: string }) => s.startsAt)).not.toContain(at(tomorrow, '09:00'));
    expect(after).toHaveLength(3);
  });

  it('never books the same slot twice, even when two patients press at once', async () => {
    const h = await clinic();
    const [sara, omar] = [await h.patient('سارة'), await h.patient('عمر')];
    const slot = at(tomorrow, '08:30');
    const [a, b] = await Promise.all([sara.book(slot), omar.book(slot)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe('SLOT_TAKEN');
    expect(
      await prisma.appointment.count({ where: { doctorId: h.doctor.id, status: 'BOOKED' } }),
    ).toBe(1);
    // A cancelled visit frees its slot again.
    await prisma.appointment.updateMany({
      where: { doctorId: h.doctor.id },
      data: { status: 'CANCELLED' },
    });
    expect((await omar.book(slot)).status).toBe(201);
  });

  it('only real, future slots of the doctor within the booking window', async () => {
    const h = await clinic();
    const sara = await h.patient('سارة');
    const refused = async (startsAt: string) => (await sara.book(startsAt)).body.error?.code;
    expect(await refused(at(tomorrow, '08:15'))).toBe('SLOT_UNAVAILABLE'); // between slots
    expect(await refused(at(tomorrow, '10:00'))).toBe('SLOT_UNAVAILABLE'); // after hours
    expect(await refused(at(addLocalDays(tomorrow, -2), '08:00'))).toBe('SLOT_UNAVAILABLE'); // past
    expect(await refused(at(addLocalDays(tomorrow, 40), '08:00'))).toBe('SLOT_UNAVAILABLE'); // too far
    expect((await sara.slots({ from: addLocalDays(tomorrow, 40) })).body.days).toEqual([]);
  });

  it('a patient cannot be in two visits at once; reception books for a patient', async () => {
    const h = await clinic();
    const sara = await h.patient('سارة');
    await sara.book(at(tomorrow, '08:00'));
    // Another doctor at the same time.
    const other = await createUser(h.id, {
      email: `d2-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.doctorProfile.create({
      data: { hospitalId: h.id, userId: other.id, specialty: 'عصبية', visitMinutes: 30 },
    });
    await prisma.doctorSchedule.create({
      data: {
        hospitalId: h.id,
        doctorId: other.id,
        weekday: new Date(`${tomorrow}T12:00:00Z`).getUTCDay(),
        startMinute: 480,
        endMinute: 600,
      },
    });
    expect((await sara.book(at(tomorrow, '08:00'), { doctorId: other.id })).body.error.code).toBe(
      'PATIENT_BUSY',
    );

    const omar = await h.patient('عمر');
    const byReception = await h.receptionBook({
      patientId: omar.id,
      startsAt: at(tomorrow, '09:30'),
    });
    expect(byReception.status).toBe(201);
    expect(byReception.body.appointment.patientId).toBe(omar.id);
    // Reception must say who the patient is.
    expect((await h.receptionBook({ startsAt: at(tomorrow, '09:00') })).status).toBe(400);
  });
});
