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

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function theatre() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [er, operations] = await Promise.all(
    (['EMERGENCY', 'OPERATIONS'] as const).map((code) =>
      prisma.department.create({ data: { hospitalId: id, name: code, code } }),
    ),
  );
  async function person(
    role: 'ADMIN' | 'DOCTOR' | 'NURSE',
    fullName: string,
    departmentId?: string,
  ) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (departmentId) {
      await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      board: () => request(app).get('/api/operating-rooms/board').set(auth),
      step: (roomId: string, to: string, bookingId?: string) =>
        request(app)
          .post(`/api/operating-rooms/${roomId}/transition`)
          .set(auth)
          .send({ to, bookingId }),
    };
  }
  const room = await prisma.operatingRoom.create({
    data: { hospitalId: id, name: 'غرفة 1', status: 'BOOKED' },
  });
  const patient = await prisma.patient.create({
    data: { hospitalId: id, fullName: 'سارة', medicalRecord: { create: { hospitalId: id } } },
  });
  const book = (
    procedure: string,
    startsIn: number,
    kind: 'SCHEDULED' | 'EMERGENCY' = 'SCHEDULED',
  ) =>
    prisma.operationBooking.create({
      data: {
        hospitalId: id,
        operatingRoomId: room.id,
        patientId: patient.id,
        surgeonName: 'د. سامي',
        procedure,
        kind,
        startsAt: inMinutes(startsIn),
        endsAt: inMinutes(startsIn + 60),
      },
    });
  /** A cleaner covering these departments. */
  async function cleaner(fullName: string, departmentIds: string[]) {
    const user = await createUser(id, {
      email: `c-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'CLEANER',
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    await prisma.cleanerAssignment.createMany({
      data: departmentIds.map((departmentId) => ({
        hospitalId: id,
        userId: user.id,
        departmentId,
      })),
    });
    return user;
  }
  return { id, er, operations, room, person, book, cleaner };
}

const bookingOf = (id: string) => prisma.operationBooking.findUniqueOrThrow({ where: { id } });

describe('operating room nurse board (task 2.22)', () => {
  it('lists each room with what waits for it, emergencies first, in full for the team', async () => {
    const h = await theatre();
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    await h.book('استئصال زائدة', 20);
    await h.book('فتح بطن', 30, 'EMERGENCY');

    const res = await orNurse.board();

    expect(res.status).toBe(200);
    expect(res.body.rooms).toEqual([
      expect.objectContaining({
        name: 'غرفة 1',
        status: 'BOOKED',
        current: null,
        queue: [
          expect.objectContaining({ kind: 'EMERGENCY', procedure: 'فتح بطن' }),
          expect.objectContaining({
            kind: 'SCHEDULED',
            procedure: 'استئصال زائدة',
            patient: expect.objectContaining({ fullName: 'سارة' }),
          }),
        ],
      }),
    ]);
  });

  it('only the operating room team and the admin see the board', async () => {
    const h = await theatre();
    expect((await (await h.person('NURSE', 'لينا', h.er.id)).board()).status).toBe(403);
    expect((await (await h.person('DOCTOR', 'د. سامي')).board()).status).toBe(403);
    expect((await (await h.person('ADMIN', 'المدير')).board()).status).toBe(200);
  });

  it('prepare, start and end carry the booking: in progress, started, completed', async () => {
    const h = await theatre();
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const scheduled = await h.book('استئصال زائدة', 20);
    const emergency = await h.book('فتح بطن', 0, 'EMERGENCY');

    expect((await orNurse.step(h.room.id, 'PREPARING')).body.operatingRoom.status).toBe(
      'PREPARING',
    );
    expect(await bookingOf(emergency.id)).toMatchObject({ status: 'IN_PROGRESS', startedAt: null });
    expect((await bookingOf(scheduled.id)).status).toBe('SCHEDULED');
    const preparing = (await orNurse.board()).body.rooms[0];
    expect(preparing.current).toMatchObject({ id: emergency.id, procedure: 'فتح بطن' });
    expect(preparing.queue.map((b: { id: string }) => b.id)).toEqual([scheduled.id]);

    await orNurse.step(h.room.id, 'IN_SURGERY');
    expect((await bookingOf(emergency.id)).startedAt).toBeInstanceOf(Date);
    expect((await orNurse.board()).body.rooms[0].current.startedAt).not.toBeNull();

    const ended = await orNurse.step(h.room.id, 'AWAITING_STERILIZATION');
    expect(ended.body.operatingRoom.status).toBe('AWAITING_STERILIZATION');
    expect(await bookingOf(emergency.id)).toMatchObject({
      status: 'COMPLETED',
      endedAt: expect.any(Date),
    });
    const history = await prisma.operatingRoomStatusChange.findMany({
      where: { operatingRoomId: h.room.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((c) => [c.toStatus, c.bookingId, c.changedByName])).toEqual([
      ['PREPARING', emergency.id, 'رامي'],
      ['IN_SURGERY', emergency.id, 'رامي'],
      ['AWAITING_STERILIZATION', emergency.id, 'رامي'],
    ]);
  });

  it('the nurse may prepare for another waiting booking, not an unknown one', async () => {
    const h = await theatre();
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const first = await h.book('استئصال زائدة', 10);
    const second = await h.book('تنظير ركبة', 90);

    expect((await orNurse.step(h.room.id, 'PREPARING', crypto.randomUUID())).status).toBe(404);
    expect(await prisma.operatingRoom.findUnique({ where: { id: h.room.id } })).toMatchObject({
      status: 'BOOKED',
    });
    await orNurse.step(h.room.id, 'PREPARING', second.id);
    expect((await bookingOf(second.id)).status).toBe('IN_PROGRESS');
    expect((await bookingOf(first.id)).status).toBe('SCHEDULED');
  });

  it('two nurses pressing the same step at once: one makes it, the other is told', async () => {
    const h = await theatre();
    const rami = await h.person('NURSE', 'رامي', h.operations.id);
    const huda = await h.person('NURSE', 'هدى', h.operations.id);
    await h.book('استئصال زائدة', 10);

    const results = await Promise.all([
      rami.step(h.room.id, 'PREPARING'),
      huda.step(h.room.id, 'PREPARING'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.operatingRoomStatusChange.count({ where: { operatingRoomId: h.room.id } }),
    ).toBe(1);
  });
});

describe('ending an operation calls the sterilization team (task 2.23)', () => {
  it('saves a sterilization request and urgently notifies the cleaners covering operations only', async () => {
    const h = await theatre();
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    const sterilizer = await h.cleaner('أبو محمد', [h.operations.id, h.er.id]);
    const erCleaner = await h.cleaner('أم علي', [h.er.id]);
    await h.book('فتح بطن', 0, 'EMERGENCY');
    for (const to of ['PREPARING', 'IN_SURGERY', 'AWAITING_STERILIZATION']) {
      expect((await orNurse.step(h.room.id, to)).status).toBe(200);
    }

    expect(await prisma.cleaningRequest.findMany({ where: { hospitalId: h.id } })).toEqual([
      expect.objectContaining({
        kind: 'STERILIZATION',
        status: 'PENDING',
        departmentId: h.operations.id,
        operatingRoomId: h.room.id,
        place: 'غرفة 1',
        requestedById: orNurse.id,
      }),
    ]);
    expect(await prisma.notification.findMany({ where: { userId: sterilizer.id } })).toEqual([
      expect.objectContaining({
        type: 'OPERATION_ENDED',
        urgent: true,
        data: { room: 'غرفة 1', procedure: 'فتح بطن' },
        link: '/cleaner/tasks',
      }),
    ]);
    expect(await prisma.notification.count({ where: { userId: erCleaner.id } })).toBe(0);
  });

  it('no second request while one is still open, and none for the other steps', async () => {
    const h = await theatre();
    const orNurse = await h.person('NURSE', 'رامي', h.operations.id);
    await h.book('فتح بطن', 0);
    await orNurse.step(h.room.id, 'PREPARING');
    await orNurse.step(h.room.id, 'IN_SURGERY');
    expect(await prisma.cleaningRequest.count({ where: { hospitalId: h.id } })).toBe(0);
    await prisma.cleaningRequest.create({
      data: {
        hospitalId: h.id,
        departmentId: h.operations.id,
        kind: 'STERILIZATION',
        operatingRoomId: h.room.id,
      },
    });

    await orNurse.step(h.room.id, 'AWAITING_STERILIZATION');

    expect(await prisma.cleaningRequest.count({ where: { hospitalId: h.id } })).toBe(1);
  });
});
