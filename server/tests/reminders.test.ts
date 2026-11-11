import { addLocalDays, zonedDate, zonedInstant } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { setPushTransport } from '../src/services/push.service.js';
import { runAppointmentReminders, runDueReminders } from '../src/services/reminder.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  setPushTransport(null);
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

const today = zonedDate(new Date());

async function patient(language: 'AR' | 'EN' = 'AR') {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const user = await createUser(id, {
    email: `p-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'PATIENT',
  });
  await prisma.user.update({ where: { id: user.id }, data: { language } });
  const record = await prisma.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة',
      userId: user.id,
      medicalRecord: { create: { hospitalId: id } },
    },
    include: { medicalRecord: true },
  });
  const prescription = await prisma.prescription.create({
    data: {
      hospitalId: id,
      recordId: record.medicalRecord!.id,
      doctorName: 'د. سامي',
      items: {
        create: [
          {
            hospitalId: id,
            drugName: 'أملوديبين',
            dose: '5 ملغ',
            frequency: 'مرة باليوم',
            durationDays: 30,
          },
          { hospitalId: id, drugName: 'ميتفورمين', dose: '500 ملغ', frequency: 'مرتين باليوم' },
        ],
      },
    },
    include: { items: { orderBy: { drugName: 'asc' } } },
  });
  const auth = {
    Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'PATIENT' })}`,
  };
  return {
    id,
    user,
    patientId: record.id,
    items: prescription.items,
    medications: () => request(app).get('/api/patients/me/medications').set(auth),
    remind: (body: object) =>
      request(app)
        .post('/api/patients/me/reminders')
        .set(auth)
        .send({ startDate: today, endDate: null, prescriptionItemId: null, ...body }),
    update: (reminderId: string, body: object) =>
      request(app).patch(`/api/patients/me/reminders/${reminderId}`).set(auth).send(body),
    remove: (reminderId: string) =>
      request(app).delete(`/api/patients/me/reminders/${reminderId}`).set(auth),
    subscribe: (endpoint: string) =>
      request(app)
        .post('/api/push/subscriptions')
        .set(auth)
        .send({ endpoint, keys: { p256dh: 'key', auth: 'secret' } }),
  };
}

/** An instant a few minutes after a local time today, in hospital time. */
const after = (hhmm: string, minutes: number, date = today) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Date(zonedInstant(date, h * 60 + m).getTime() + minutes * 60_000);
};

describe('medication reminders (task 3.26)', () => {
  it('lists my prescribed medicines; a reminder per medicine, with the times I choose', async () => {
    const p = await patient();
    const amlo = p.items.find((i) => i.drugName === 'أملوديبين')!;
    const res = await p.remind({
      prescriptionItemId: amlo.id,
      drugName: 'أملوديبين',
      dose: '5 ملغ',
      times: ['20:00', '08:00'],
      endDate: addLocalDays(today, 29),
    });
    expect(res.status).toBe(201);
    expect(res.body.reminder).toMatchObject({
      times: ['08:00', '20:00'],
      active: true,
      startDate: today,
    });

    const { medications } = (await p.medications()).body;
    expect(medications.map((m: { drugName: string }) => m.drugName).sort()).toEqual([
      'أملوديبين',
      'ميتفورمين',
    ]);
    expect(
      medications.find((m: { drugName: string }) => m.drugName === 'أملوديبين').reminder.times,
    ).toEqual(['08:00', '20:00']);
    expect(
      medications.find((m: { drugName: string }) => m.drugName === 'ميتفورمين').reminder,
    ).toBeNull();

    // One reminder per prescribed medicine; my own extra one is fine.
    expect(
      (await p.remind({ prescriptionItemId: amlo.id, drugName: 'x', dose: 'y', times: ['09:00'] }))
        .status,
    ).toBe(409);
    expect((await p.remind({ drugName: 'فيتامين د', dose: 'حبة', times: ['09:00'] })).status).toBe(
      201,
    );

    const id = res.body.reminder.id;
    expect((await p.update(id, { active: false })).body.reminder.active).toBe(false);
    expect((await p.update(id, { times: ['07:30'] })).body.reminder.times).toEqual(['07:30']);
    expect((await p.remove(id)).status).toBe(204);
    expect((await p.remove(id)).status).toBe(404);
  });

  it('sends each dose once, on time, in the app and to my devices in my language', async () => {
    const p = await patient('EN');
    const pushed: { endpoint: string; payload: string }[] = [];
    setPushTransport(async (target, payload) => {
      pushed.push({ endpoint: target.endpoint, payload });
    });
    expect((await p.subscribe('https://push.example.com/phone')).status).toBe(201);
    const { reminder } = (
      await p.remind({ drugName: 'Amlodipine', dose: '5 mg', times: ['08:00', '20:00'] })
    ).body;

    // Before the time: nothing. Two minutes after: sent. Again: not twice.
    await runDueReminders(after('08:00', -5));
    expect(await prisma.notification.count({ where: { userId: p.user.id } })).toBe(0);
    await runDueReminders(after('08:00', 2));
    await runDueReminders(after('08:00', 3));
    const notices = await prisma.notification.findMany({ where: { userId: p.user.id } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'MEDICATION_REMINDER',
      data: expect.objectContaining({
        drug: 'Amlodipine',
        dose: '5 mg',
        time: '08:00',
        reminderId: reminder.id,
      }),
      link: '/patient/medications',
    });
    expect(pushed).toHaveLength(1);
    expect(JSON.parse(pushed[0]!.payload)).toMatchObject({
      title: 'Time for Amlodipine',
      body: '5 mg · at 08:00',
      url: '/patient/medications',
    });

    // Far too late (the server was down for hours): skipped, not sent at noon.
    await runDueReminders(after('08:00', 240));
    expect(await prisma.notification.count({ where: { userId: p.user.id } })).toBe(1);
  });

  it('skips paused reminders and those not started or over; forgets a browser that is gone', async () => {
    const p = await patient();
    const paused = (await p.remind({ drugName: 'أ', dose: '1', times: ['08:00'] })).body.reminder;
    await p.update(paused.id, { active: false });
    await p.remind({
      drugName: 'ب',
      dose: '1',
      times: ['08:00'],
      startDate: addLocalDays(today, 1),
    });
    await prisma.medicationReminder.create({
      data: {
        hospitalId: p.id,
        patientId: p.patientId,
        drugName: 'ج',
        dose: '1',
        times: ['08:00'],
        startDate: new Date(`${addLocalDays(today, -10)}T00:00:00Z`),
        endDate: new Date(`${addLocalDays(today, -3)}T00:00:00Z`),
      },
    });
    const live = (await p.remind({ drugName: 'د', dose: '1', times: ['08:00'] })).body.reminder;
    setPushTransport(async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    await p.subscribe('https://push.example.com/old-phone');

    await runDueReminders(after('08:00', 1));
    const notices = await prisma.notification.findMany({ where: { userId: p.user.id } });
    expect(notices.map((n) => (n.data as { reminderId: string }).reminderId)).toEqual([live.id]);
    // The browser said it is gone: its subscription is removed.
    expect(await prisma.pushSubscription.count({ where: { userId: p.user.id } })).toBe(0);
  });

  it('only patients have medicines; push keys and subscriptions need a signed-in user', async () => {
    const p = await patient();
    const nurse = await createUser(p.id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    const nurseAuth = {
      Authorization: `Bearer ${signAccessToken({ sub: nurse.id, hospitalId: p.id, role: 'NURSE' })}`,
    };
    expect((await request(app).get('/api/patients/me/medications').set(nurseAuth)).status).toBe(
      403,
    );
    expect((await request(app).get('/api/push/key').set(nurseAuth)).status).toBe(200);
    expect((await request(app).get('/api/push/key')).status).toBe(401);
    expect((await p.subscribe('not a url')).status).toBe(400);
  });
});

describe('visit reminders (task 3.27)', () => {
  async function visit(p: Awaited<ReturnType<typeof patient>>, startsAt: Date, bookedAt: Date) {
    return prisma.appointment.create({
      data: {
        hospitalId: p.id,
        doctorName: 'د. سامي',
        patientId: p.patientId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        createdAt: bookedAt,
      },
    });
  }
  const HOUR = 3_600_000;

  it('reminds the day before and two hours before, each once, on the device too', async () => {
    const p = await patient('EN');
    const pushed: string[] = [];
    setPushTransport(async (_target, payload) => {
      pushed.push(payload);
    });
    await p.subscribe('https://push.example.com/phone');
    const base = Date.now();
    const startsAt = new Date(base + 30 * HOUR);
    const v = await visit(p, startsAt, new Date(base - 3 * 24 * HOUR));
    const at = (hoursBefore: number) => new Date(startsAt.getTime() - hoursBefore * HOUR);

    expect(await runAppointmentReminders(at(25))).toBe(0); // too early
    expect(await runAppointmentReminders(at(23.9))).toBe(1); // the day before
    expect(await runAppointmentReminders(at(23))).toBe(0); // not again
    expect(await runAppointmentReminders(at(3))).toBe(0);
    expect(await runAppointmentReminders(at(1.9))).toBe(1); // shortly before
    expect(await runAppointmentReminders(at(1))).toBe(0);
    expect(await runAppointmentReminders(new Date(startsAt.getTime() + 60_000))).toBe(0); // past

    const notices = await prisma.notification.findMany({
      where: { userId: p.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(notices.map((n) => (n.data as { kind: string }).kind)).toEqual(['DAY', 'SOON']);
    expect(notices[0]).toMatchObject({
      type: 'FOLLOW_UP_REMINDER',
      data: expect.objectContaining({
        doctor: 'د. سامي',
        appointmentId: v.id,
        startsAt: startsAt.toISOString(),
      }),
      link: '/patient/appointments',
    });
    expect(pushed.map((m) => JSON.parse(m).title)).toEqual([
      'You have a visit tomorrow',
      'Your visit is soon',
    ]);
  });

  it('no "tomorrow" for a visit booked less than a day ahead; nothing for a cancelled one', async () => {
    const p = await patient();
    const base = Date.now();
    const soonVisit = await visit(p, new Date(base + 10 * HOUR), new Date(base));
    const cancelled = await visit(p, new Date(base + 20 * HOUR), new Date(base - 3 * 24 * HOUR));
    await prisma.appointment.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });

    expect(await runAppointmentReminders(new Date(base + 60_000))).toBe(0);
    // Two hours before the late-booked visit: that one is sent.
    expect(await runAppointmentReminders(new Date(soonVisit.startsAt.getTime() - 1.5 * HOUR))).toBe(
      1,
    );
    const kinds = (await prisma.notification.findMany({ where: { userId: p.user.id } })).map(
      (n) => (n.data as { kind: string; appointmentId: string }).appointmentId,
    );
    expect(kinds).toEqual([soonVisit.id]);
  });
});
