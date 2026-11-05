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

/** Tomorrow at this hour, as ISO. */
const tomorrowAt = (hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

async function theatre() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const ward = await prisma.department.create({
    data: { hospitalId: id, name: 'العمليات', code: 'OPERATIONS' },
  });
  async function doctor(fullName: string) {
    const user = await createUser(id, {
      email: `d-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const token = signAccessToken({ sub: user.id, hospitalId: id, role: 'DOCTOR' });
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: `مريض ${fullName}`,
        medicalRecord: { create: { hospitalId: id, doctorId: user.id } },
      },
    });
    const auth = { Authorization: `Bearer ${token}` };
    return {
      ...user,
      patient,
      book: (body: object) =>
        request(app)
          .post('/api/bookings')
          .set(auth)
          .send({
            operatingRoomId: room.id,
            patientId: patient.id,
            procedure: 'استئصال زائدة',
            durationMinutes: 60,
            notes: null,
            ...body,
          }),
      cancel: (bookingId: string) => request(app).delete(`/api/bookings/${bookingId}`).set(auth),
      day: (from: string, to: string) =>
        request(app).get('/api/bookings').query({ from, to }).set(auth),
      mine: () => request(app).get('/api/bookings/mine').set(auth),
      emergency: (body: object) =>
        request(app)
          .post('/api/bookings/emergency')
          .set(auth)
          .send({
            operatingRoomId: room.id,
            procedure: 'فتح بطن',
            durationMinutes: 60,
            notes: null,
            ...body,
          }),
      reschedule: (bookingId: string, body: object) =>
        request(app)
          .patch(`/api/bookings/${bookingId}`)
          .set(auth)
          .send({ operatingRoomId: room.id, durationMinutes: 60, ...body }),
    };
  }
  /** A nurse of the given department, who books emergencies from an ER visit. */
  async function nurse(departmentId: string) {
    const user = await createUser(id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    const token = signAccessToken({ sub: user.id, hospitalId: id, role: 'NURSE' });
    return {
      ...user,
      emergency: (body: object) =>
        request(app)
          .post('/api/bookings/emergency')
          .set('Authorization', `Bearer ${token}`)
          .send({
            operatingRoomId: room.id,
            procedure: 'فتح بطن',
            durationMinutes: 60,
            notes: null,
            ...body,
          }),
    };
  }
  /** An ER visit; its patient's file belongs to the given doctor, if any. */
  async function visit(
    doctorId: string | null = null,
    status: 'WAITING' | 'DISCHARGED' = 'WAITING',
  ) {
    const patient = await prisma.patient.create({
      data: {
        hospitalId: id,
        fullName: 'مريض الإسعاف',
        medicalRecord: { create: { hospitalId: id, doctorId } },
      },
    });
    return prisma.triageAssessment.create({
      data: { hospitalId: id, patientId: patient.id, status, level: 1 },
    });
  }
  const room = await prisma.operatingRoom.create({ data: { hospitalId: id, name: 'غرفة 1' } });
  const room2 = await prisma.operatingRoom.create({ data: { hospitalId: id, name: 'غرفة 2' } });
  return { id, ward, room, room2, doctor, nurse, visit };
}

/** In this many minutes from now, as ISO. */
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const roomStatus = async (id: string) =>
  (await prisma.operatingRoom.findUnique({ where: { id } }))?.status;

describe('scheduled operating room bookings (task 2.20)', () => {
  it('books a free slot for my patient; the room becomes booked and the history says who', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');

    const res = await sami.book({ startsAt: tomorrowAt(10), durationMinutes: 90 });

    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({
      kind: 'SCHEDULED',
      status: 'SCHEDULED',
      mine: true,
      procedure: 'استئصال زائدة',
      operatingRoom: { name: 'غرفة 1' },
      patient: { fullName: 'مريض د. سامي' },
    });
    expect(
      new Date(res.body.booking.endsAt).getTime() - new Date(res.body.booking.startsAt).getTime(),
    ).toBe(90 * 60_000);
    expect(await roomStatus(h.room.id)).toBe('BOOKED');
    expect(
      await prisma.operatingRoomStatusChange.findFirst({ where: { operatingRoomId: h.room.id } }),
    ).toMatchObject({
      toStatus: 'BOOKED',
      changedByName: 'د. سامي',
      bookingId: res.body.booking.id,
    });
  });

  it('refuses an overlapping slot in the same room, but not touching ones or another room', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    await sami.book({ startsAt: tomorrowAt(10), durationMinutes: 60 });

    const clash = await nour.book({ startsAt: tomorrowAt(10, 30) });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatchObject({
      code: 'BOOKING_CONFLICT',
      details: { conflict: { startsAt: tomorrowAt(10) } },
    });

    expect((await nour.book({ startsAt: tomorrowAt(11) })).status).toBe(201);
    expect(
      (await nour.book({ startsAt: tomorrowAt(10, 30), operatingRoomId: h.room2.id })).status,
    ).toBe(201);
  });

  it('two doctors booking the same slot at the same moment: only one gets it', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');

    const results = await Promise.all([
      sami.book({ startsAt: tomorrowAt(9) }),
      nour.book({ startsAt: tomorrowAt(9) }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.operationBooking.count({ where: { operatingRoomId: h.room.id } })).toBe(1);
  });

  it('refuses another doctor’s patient, a past start, and a room out of service', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');

    expect((await nour.book({ patientId: sami.patient.id, startsAt: tomorrowAt(10) })).status).toBe(
      404,
    );
    expect((await sami.book({ startsAt: '2020-01-01T10:00:00.000Z' })).status).toBe(400);
    await prisma.operatingRoom.update({
      where: { id: h.room2.id },
      data: { status: 'OUT_OF_SERVICE' },
    });
    const closed = await sami.book({ startsAt: tomorrowAt(10), operatingRoomId: h.room2.id });
    expect(closed.body.error.code).toBe('ROOM_OUT_OF_SERVICE');
  });

  it('the schedule hides other doctors’ patients; my list shows my upcoming bookings', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    await sami.book({ startsAt: tomorrowAt(10) });
    await nour.book({ startsAt: tomorrowAt(12) });

    const day = (await nour.day(tomorrowAt(0), tomorrowAt(23, 59))).body.bookings;
    expect(day).toEqual([
      expect.objectContaining({
        surgeonName: 'د. سامي',
        mine: false,
        patient: null,
        procedure: null,
      }),
      expect.objectContaining({
        surgeonName: 'د. نور',
        mine: true,
        patient: expect.objectContaining({ fullName: 'مريض د. نور' }),
      }),
    ]);
    expect(
      (await sami.mine()).body.bookings.map((b: { surgeonName: string }) => b.surgeonName),
    ).toEqual(['د. سامي']);
  });

  it('cancelling frees the slot, and the room once nothing else is waiting', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    const first = (await sami.book({ startsAt: tomorrowAt(10) })).body.booking;
    const second = (await sami.book({ startsAt: tomorrowAt(14) })).body.booking;

    expect((await nour.cancel(first.id)).status).toBe(404);
    expect((await sami.cancel(first.id)).body.booking.status).toBe('CANCELLED');
    expect(await roomStatus(h.room.id)).toBe('BOOKED');
    expect((await nour.book({ startsAt: tomorrowAt(10) })).status).toBe(201);

    await sami.cancel(second.id);
    const nourBooking = (await nour.mine()).body.bookings[0];
    await nour.cancel(nourBooking.id);
    expect(await roomStatus(h.room.id)).toBe('AVAILABLE');
    expect((await sami.cancel(first.id)).status).toBe(409);
  });
});

describe('emergency bookings (task 2.21)', () => {
  it('an ER nurse books the room now: the scheduled booking in the way is postponed and its doctor told', async () => {
    const h = await theatre();
    const er = await prisma.department.create({
      data: { hospitalId: h.id, name: 'الإسعاف', code: 'EMERGENCY' },
    });
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    const soon = (await sami.book({ startsAt: inMinutes(20) })).body.booking;
    const later = (await sami.book({ startsAt: inMinutes(180) })).body.booking;
    const lina = await h.nurse(er.id);
    const arrival = await h.visit(nour.id);

    const res = await lina.emergency({ visitId: arrival.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      postponed: 1,
      booking: {
        kind: 'EMERGENCY',
        status: 'SCHEDULED',
        surgeonName: 'د. نور',
        mine: true,
        procedure: 'فتح بطن',
      },
    });
    const statusOf = async (bookingId: string) =>
      (await prisma.operationBooking.findUnique({ where: { id: bookingId } }))?.status;
    expect(await statusOf(soon.id)).toBe('POSTPONED');
    expect(await statusOf(later.id)).toBe('SCHEDULED');
    expect(await prisma.notification.findMany({ where: { userId: sami.id } })).toEqual([
      expect.objectContaining({
        type: 'OPERATION_POSTPONED',
        urgent: true,
        data: { procedure: 'استئصال زائدة', room: 'غرفة 1' },
        link: '/doctor/or-bookings',
      }),
    ]);
    expect(
      await prisma.operationBooking.findFirst({ where: { kind: 'EMERGENCY', hospitalId: h.id } }),
    ).toMatchObject({ triageId: arrival.id, surgeonId: nour.id, bookedById: lina.id });
    // The postponed one no longer holds the slot in the schedule, but stays in my list.
    const day = (await sami.day(inMinutes(-60), inMinutes(600))).body.bookings;
    expect(day.map((b: { kind: string }) => b.kind)).toEqual(['EMERGENCY', 'SCHEDULED']);
    expect((await sami.mine()).body.bookings.map((b: { status: string }) => b.status)).toEqual([
      'POSTPONED',
      'SCHEDULED',
    ]);
  });

  it('refuses a room in use, a second emergency at once, other nurses and closed visits', async () => {
    const h = await theatre();
    const er = await prisma.department.create({
      data: { hospitalId: h.id, name: 'الإسعاف', code: 'EMERGENCY' },
    });
    const lina = await h.nurse(er.id);
    const wardNurse = await h.nurse(h.ward.id);
    const arrival = await h.visit();

    expect((await wardNurse.emergency({ visitId: arrival.id })).status).toBe(403);
    const closed = await h.visit(null, 'DISCHARGED');
    expect((await lina.emergency({ visitId: closed.id })).status).toBe(404);
    expect((await lina.emergency({ patientId: arrival.patientId })).status).toBe(403);

    const first = await lina.emergency({ visitId: arrival.id });
    expect(first.status).toBe(201);
    expect(first.body.booking.surgeonName).toBe('');
    const second = await lina.emergency({ visitId: (await h.visit()).id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('BOOKING_CONFLICT');

    await prisma.operatingRoom.update({
      where: { id: h.room2.id },
      data: { status: 'IN_SURGERY' },
    });
    const busy = await lina.emergency({ visitId: arrival.id, operatingRoomId: h.room2.id });
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('ROOM_BUSY');
  });

  it('a doctor books an emergency for their own patient, and is not told about their own booking', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    await sami.book({ startsAt: inMinutes(30) });

    expect((await nour.emergency({ patientId: sami.patient.id })).status).toBe(404);
    const res = await sami.emergency({ patientId: sami.patient.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ postponed: 1, booking: { surgeonName: 'د. سامي' } });
    expect(await prisma.notification.count({ where: { userId: sami.id } })).toBe(0);
    expect(await roomStatus(h.room.id)).toBe('BOOKED');
  });

  it('the doctor reschedules a postponed booking to a free time; a clash is still refused', async () => {
    const h = await theatre();
    const sami = await h.doctor('د. سامي');
    const nour = await h.doctor('د. نور');
    const mine = (await sami.book({ startsAt: inMinutes(20) })).body.booking;
    await sami.emergency({ patientId: sami.patient.id, durationMinutes: 120 });
    await nour.book({ startsAt: tomorrowAt(10) });

    expect((await nour.reschedule(mine.id, { startsAt: tomorrowAt(15) })).status).toBe(404);
    const clash = await sami.reschedule(mine.id, { startsAt: tomorrowAt(10, 30) });
    expect(clash.body.error.code).toBe('BOOKING_CONFLICT');

    const moved = await sami.reschedule(mine.id, {
      startsAt: tomorrowAt(15),
      operatingRoomId: h.room2.id,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.booking).toMatchObject({
      status: 'SCHEDULED',
      startsAt: tomorrowAt(15),
      operatingRoom: { name: 'غرفة 2' },
    });
    expect(await roomStatus(h.room2.id)).toBe('BOOKED');
  });
});
