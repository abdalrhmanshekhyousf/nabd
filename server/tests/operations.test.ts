import { BOOKING_KINDS, BOOKING_STATUSES, CLEANING_KINDS, CLEANING_STATUSES } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  BookingKind,
  BookingStatus,
  CleaningKind,
  CleaningStatus,
} from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { changeRoomStatus } from '../src/services/roomStatus.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function theatre() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const db = forHospital(id);
  const person = async (role: 'ADMIN' | 'DOCTOR' | 'NURSE', fullName: string) => {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    return { ...user, fullName, token: signAccessToken({ sub: user.id, hospitalId: id, role }) };
  };
  const admin = await person('ADMIN', 'المدير');
  const surgeon = await person('DOCTOR', 'د. سامي');
  const operations = await prisma.department.create({
    data: { hospitalId: id, name: 'العمليات', code: 'OPERATIONS' },
  });
  const room = await prisma.operatingRoom.create({ data: { hospitalId: id, name: 'غرفة 1' } });
  const patient = await prisma.patient.create({
    data: { hospitalId: id, fullName: 'سارة', medicalRecord: { create: { hospitalId: id } } },
  });
  return { id, db, admin, surgeon, operations, room, patient, person };
}

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe('operation bookings', () => {
  it('keeps a scheduled booking with its room and times, and an emergency one waiting for a room', async () => {
    const h = await theatre();

    const scheduled = await h.db.operationBooking.create({
      data: {
        hospitalId: h.id,
        operatingRoomId: h.room.id,
        patientId: h.patient.id,
        surgeonId: h.surgeon.id,
        surgeonName: h.surgeon.fullName,
        bookedById: h.surgeon.id,
        procedure: 'استئصال زائدة',
        startsAt: at(2),
        endsAt: at(3),
      },
    });
    const emergency = await h.db.operationBooking.create({
      data: {
        hospitalId: h.id,
        patientId: h.patient.id,
        surgeonName: h.surgeon.fullName,
        kind: 'EMERGENCY',
        procedure: 'نزيف داخلي',
        startsAt: at(0),
        endsAt: at(1),
      },
    });

    expect(scheduled).toMatchObject({ kind: 'SCHEDULED', status: 'SCHEDULED', startedAt: null });
    expect(emergency).toMatchObject({ kind: 'EMERGENCY', operatingRoomId: null });
  });

  it('the database refuses a booking that ends before it starts', async () => {
    const h = await theatre();
    await expect(
      h.db.operationBooking.create({
        data: {
          hospitalId: h.id,
          patientId: h.patient.id,
          surgeonName: 'x',
          procedure: 'x',
          startsAt: at(3),
          endsAt: at(2),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('cleaning requests', () => {
  it('a sterilization job for an operating room, for the cleaners of a department', async () => {
    const h = await theatre();

    const job = await h.db.cleaningRequest.create({
      data: {
        hospitalId: h.id,
        departmentId: h.operations.id,
        kind: 'STERILIZATION',
        operatingRoomId: h.room.id,
        requestedById: h.admin.id,
      },
    });

    expect(job).toMatchObject({
      status: 'PENDING',
      kind: 'STERILIZATION',
      startedAt: null,
      finishedAt: null,
    });
    expect(
      await forHospital((await createHospital()).id).cleaningRequest.count({
        where: { id: job.id },
      }),
    ).toBe(0);
  });
});

describe('the operating room history', () => {
  it('records every change with who made it; the same status changes nothing', async () => {
    const h = await theatre();

    await h.db.$transaction((tx) =>
      changeRoomStatus(tx, {
        hospitalId: h.id,
        roomId: h.room.id,
        to: 'BOOKED',
        actorId: h.surgeon.id,
      }),
    );
    const repeated = await h.db.$transaction((tx) =>
      changeRoomStatus(tx, {
        hospitalId: h.id,
        roomId: h.room.id,
        to: 'BOOKED',
        actorId: h.surgeon.id,
      }),
    );

    expect(repeated).toBeNull();
    const room = await prisma.operatingRoom.findUnique({ where: { id: h.room.id } });
    expect(room?.status).toBe('BOOKED');
    const log = await prisma.operatingRoomStatusChange.findMany({
      where: { operatingRoomId: h.room.id },
    });
    expect(log).toEqual([
      expect.objectContaining({
        fromStatus: 'AVAILABLE',
        toStatus: 'BOOKED',
        changedByName: 'د. سامي',
      }),
    ]);
  });

  it('the admin taking a room out of service is in the history, readable by staff', async () => {
    const h = await theatre();
    const nurse = await h.person('NURSE', 'لينا');

    await request(app)
      .patch(`/api/operating-rooms/${h.room.id}/service`)
      .set('Authorization', `Bearer ${h.admin.token}`)
      .send({ outOfService: true });
    await request(app)
      .patch(`/api/operating-rooms/${h.room.id}/service`)
      .set('Authorization', `Bearer ${h.admin.token}`)
      .send({ outOfService: false });

    const res = await request(app)
      .get(`/api/operating-rooms/${h.room.id}/history`)
      .set('Authorization', `Bearer ${nurse.token}`);
    expect(res.status).toBe(200);
    expect(
      res.body.history.map(
        (c: { fromStatus: string; toStatus: string }) => `${c.fromStatus}>${c.toStatus}`,
      ),
    ).toEqual(['OUT_OF_SERVICE>AVAILABLE', 'AVAILABLE>OUT_OF_SERVICE']);
    expect(res.body.history[0].changedByName).toBe('المدير');
  });

  it('keeps the name of someone whose account was removed', async () => {
    const h = await theatre();
    await h.db.$transaction((tx) =>
      changeRoomStatus(tx, {
        hospitalId: h.id,
        roomId: h.room.id,
        to: 'BOOKED',
        actorId: h.surgeon.id,
      }),
    );

    await prisma.user.delete({ where: { id: h.surgeon.id } });

    expect(
      await prisma.operatingRoomStatusChange.findFirst({ where: { operatingRoomId: h.room.id } }),
    ).toMatchObject({
      changedById: null,
      changedByName: 'د. سامي',
    });
  });
});

describe('shared lists', () => {
  it('match the database enums', () => {
    expect([...BOOKING_KINDS].sort()).toEqual(Object.values(BookingKind).sort());
    expect([...BOOKING_STATUSES].sort()).toEqual(Object.values(BookingStatus).sort());
    expect([...CLEANING_KINDS].sort()).toEqual(Object.values(CleaningKind).sort());
    expect([...CLEANING_STATUSES].sort()).toEqual(Object.values(CleaningStatus).sort());
  });
});
