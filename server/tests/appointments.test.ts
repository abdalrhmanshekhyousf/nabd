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
      departments: () => request(app).get('/api/appointments/departments').set(auth),
      doctors: (departmentId: string) =>
        request(app).get('/api/appointments/doctors').query({ departmentId }).set(auth),
      mine: () => request(app).get('/api/appointments/mine').set(auth),
      cancel: (appointmentId: string) =>
        request(app).delete(`/api/appointments/${appointmentId}`).set(auth),
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
  const admin = await createUser(id, {
    email: `a-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'ADMIN',
  });
  const adminAuth = token(admin.id, 'ADMIN');
  const vacation = (body: object) =>
    request(app)
      .post(`/api/staff/${doctor.id}/vacations`)
      .set(adminAuth)
      .send({ reason: null, ...body });
  const dropVacation = (vacationId: string) =>
    request(app).delete(`/api/staff/${doctor.id}/vacations/${vacationId}`).set(adminAuth);
  return { id, doctor, patient, receptionBook, vacation, dropVacation };
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

describe('doctor vacations (task 3.21)', () => {
  it('closes the slots of those days, cancels their visits and tells the patients', async () => {
    const h = await clinic();
    const sara = await h.patient('سارة');
    const omar = await h.patient('عمر');
    const later = addLocalDays(tomorrow, 3);
    await sara.book(at(tomorrow, '08:00'));
    await omar.book(at(later, '09:00'));

    const res = await h.vacation({
      from: tomorrow,
      to: addLocalDays(tomorrow, 1),
      reason: 'مؤتمر',
    });
    expect(res.status).toBe(201);
    expect(res.body.cancelled).toBe(1);
    expect(res.body.schedule.vacations).toEqual([
      expect.objectContaining({ from: tomorrow, to: addLocalDays(tomorrow, 1), reason: 'مؤتمر' }),
    ]);

    // Sara's visit is cancelled and she is told; Omar's, after the vacation, stays.
    const visits = await prisma.appointment.findMany({
      orderBy: { startsAt: 'asc' },
      where: { doctorId: h.doctor.id },
    });
    expect(visits.map((v) => [v.patientId, v.status, v.cancelReason])).toEqual([
      [sara.id, 'CANCELLED', 'DOCTOR_LEAVE'],
      [omar.id, 'BOOKED', null],
    ]);
    const saraUser = await prisma.patient.findUniqueOrThrow({ where: { id: sara.id } });
    const notice = await prisma.notification.findFirstOrThrow({
      where: { userId: saraUser.userId! },
    });
    expect(notice).toMatchObject({
      type: 'APPOINTMENT_CANCELLED',
      data: { doctor: 'د. سامي', startsAt: at(tomorrow, '08:00'), reason: 'DOCTOR_LEAVE' },
      link: '/patient/appointments',
    });

    // No slots on those days, and booking them is refused.
    const days = (await sara.slots({ from: tomorrow, days: 4 })).body.days.map(
      (d: { date: string }) => d.date,
    );
    expect(days).not.toContain(tomorrow);
    expect(days).not.toContain(addLocalDays(tomorrow, 1));
    expect(days).toContain(addLocalDays(tomorrow, 2));
    expect((await sara.book(at(tomorrow, '09:00'))).body.error.code).toBe('SLOT_UNAVAILABLE');

    // Removing the vacation opens the days again.
    const id = res.body.schedule.vacations[0].id;
    expect((await h.dropVacation(id)).status).toBe(200);
    expect((await sara.book(at(tomorrow, '09:00'))).status).toBe(201);
  });

  it('refuses a vacation already over, or the wrong way round', async () => {
    const h = await clinic();
    const past = addLocalDays(tomorrow, -5);
    expect((await h.vacation({ from: past, to: addLocalDays(past, 1) })).status).toBe(400);
    expect((await h.vacation({ from: addLocalDays(tomorrow, 2), to: tomorrow })).status).toBe(400);
    expect((await h.dropVacation(crypto.randomUUID())).status).toBe(404);
  });
});

describe('patient booking (task 3.22)', () => {
  it('lists departments with bookable doctors, and each doctor’s first free slot', async () => {
    const h = await clinic();
    const cardio = await prisma.department.create({
      data: { hospitalId: h.id, name: 'القلبية', code: 'CARDIOLOGY' },
    });
    await prisma.staffProfile.create({
      data: { hospitalId: h.id, userId: h.doctor.id, departmentId: cardio.id },
    });
    // A doctor without hours is not offered.
    const idle = await createUser(h.id, {
      email: `idle-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.staffProfile.create({
      data: { hospitalId: h.id, userId: idle.id, departmentId: cardio.id },
    });
    const sara = await h.patient('سارة');
    expect((await sara.departments()).body.departments).toEqual([
      { id: cardio.id, name: 'القلبية', code: 'CARDIOLOGY', doctorCount: 1 },
    ]);
    const [doctor] = (await sara.doctors(cardio.id)).body.doctors;
    expect(doctor).toMatchObject({
      id: h.doctor.id,
      fullName: 'د. سامي',
      specialty: 'قلبية',
      visitMinutes: 30,
    });
    expect(Date.parse(doctor.nextSlot)).toBeGreaterThan(Date.now());
    expect((await sara.doctors(cardio.id)).body.doctors).toHaveLength(1);
  });

  it('shows my visits, coming and past, and lets me cancel one before it happens', async () => {
    const h = await clinic();
    const sara = await h.patient('سارة');
    const omar = await h.patient('عمر');
    const a = (await sara.book(at(tomorrow, '08:00'))).body.appointment;
    const b = (await sara.book(at(addLocalDays(tomorrow, 1), '09:00'))).body.appointment;
    await prisma.appointment.create({
      data: {
        hospitalId: h.id,
        doctorId: h.doctor.id,
        doctorName: 'د. سامي',
        patientId: sara.id,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000 + 1_800_000),
        status: 'COMPLETED',
      },
    });

    const mine = (await sara.mine()).body;
    expect(mine.upcoming.map((v: { id: string }) => v.id)).toEqual([a.id, b.id]);
    expect(mine.past.map((v: { status: string }) => v.status)).toEqual(['COMPLETED']);
    expect((await omar.mine()).body.upcoming).toEqual([]);

    // Not someone else's; then mine, once.
    expect((await omar.cancel(a.id)).status).toBe(404);
    const cancelled = await sara.cancel(a.id);
    expect(cancelled.body.appointment).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'PATIENT',
    });
    expect((await sara.cancel(a.id)).body.error.code).toBe('INVALID_TRANSITION');
    // The slot is free again.
    expect((await omar.book(at(tomorrow, '08:00'))).status).toBe(201);
    const after = (await sara.mine()).body;
    expect(after.upcoming.map((v: { id: string }) => v.id)).toEqual([b.id]);
    expect(after.past[0]).toMatchObject({ id: a.id, status: 'CANCELLED' });
  });
});
