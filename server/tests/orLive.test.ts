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

type Role = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'CLEANER';

async function hospital() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [er, operations] = await Promise.all(
    (['EMERGENCY', 'OPERATIONS'] as const).map((code) =>
      prisma.department.create({ data: { hospitalId: id, name: code, code } }),
    ),
  );
  async function person(role: Role, fullName: string, departmentId?: string) {
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
      live: () => request(app).get('/api/operating-rooms/live').set(auth),
      service: (roomId: string, outOfService: boolean) =>
        request(app)
          .patch(`/api/operating-rooms/${roomId}/service`)
          .set(auth)
          .send({ outOfService }),
    };
  }
  const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'سارة' } });
  const room = (name: string, status: 'AVAILABLE' | 'IN_SURGERY' | 'AWAITING_STERILIZATION') =>
    prisma.operatingRoom.create({ data: { hospitalId: id, name, status } });
  const operation = (roomId: string, surgeonId: string, surgeonName: string) =>
    prisma.operationBooking.create({
      data: {
        hospitalId: id,
        operatingRoomId: roomId,
        patientId: patient.id,
        surgeonId,
        surgeonName,
        procedure: 'فتح بطن',
        status: 'IN_PROGRESS',
        startsAt: new Date(Date.now() - 1_800_000),
        endsAt: new Date(Date.now() + 1_800_000),
        startedAt: new Date(Date.now() - 1_500_000),
      },
    });
  return { id, er, operations, person, room, operation };
}

describe('live operating room board (task 2.26)', () => {
  it('rooms in natural order; doctors see who operates but not on whom, unless it is theirs', async () => {
    const h = await hospital();
    const sami = await h.person('DOCTOR', 'د. سامي');
    const nour = await h.person('DOCTOR', 'د. نور');
    const room10 = await h.room('غرفة 10', 'AVAILABLE');
    const room2 = await h.room('غرفة 2', 'IN_SURGERY');
    await h.operation(room2.id, sami.id, 'د. سامي');

    const forNour = (await nour.live()).body.rooms;
    expect(forNour.map((r: { name: string }) => r.name)).toEqual(['غرفة 2', 'غرفة 10']);
    expect(forNour[0]).toMatchObject({
      status: 'IN_SURGERY',
      current: { surgeonName: 'د. سامي', procedure: null, patient: null, mine: false },
      sterilization: null,
    });
    expect(forNour[0].current.startedAt).not.toBeNull();
    expect((await sami.live()).body.rooms[0].current).toMatchObject({
      procedure: 'فتح بطن',
      patient: expect.objectContaining({ fullName: 'سارة' }),
    });
    expect(room10.id).toBeTruthy();
  });

  it('the admin and the operating room team see everything; nurses elsewhere see the board too', async () => {
    const h = await hospital();
    const sami = await h.person('DOCTOR', 'د. سامي');
    const room = await h.room('غرفة 1', 'IN_SURGERY');
    await h.operation(room.id, sami.id, 'د. سامي');

    for (const viewer of [
      await h.person('ADMIN', 'المدير'),
      await h.person('NURSE', 'رامي', h.operations.id),
    ]) {
      expect((await viewer.live()).body.rooms[0].current.procedure).toBe('فتح بطن');
    }
    const lina = await h.person('NURSE', 'لينا', h.er.id);
    expect((await lina.live()).body.rooms[0].current).toMatchObject({
      surgeonName: 'د. سامي',
      procedure: null,
    });
    expect((await (await h.person('CLEANER', 'أبو محمد')).live()).status).toBe(403);
  });

  it('shows the sterilization of a room and who is on it', async () => {
    const h = await hospital();
    const viewer = await h.person('DOCTOR', 'د. نور');
    const worker = await h.person('CLEANER', 'أبو محمد');
    const room = await h.room('غرفة 1', 'AWAITING_STERILIZATION');
    const job = await prisma.cleaningRequest.create({
      data: {
        hospitalId: h.id,
        departmentId: h.operations.id,
        kind: 'STERILIZATION',
        operatingRoomId: room.id,
      },
    });
    expect((await viewer.live()).body.rooms[0].sterilization).toEqual({
      status: 'PENDING',
      by: null,
    });
    await prisma.cleaningRequest.update({
      where: { id: job.id },
      data: { status: 'IN_PROGRESS', assignedToId: worker.id },
    });
    expect((await viewer.live()).body.rooms[0].sterilization).toEqual({
      status: 'IN_PROGRESS',
      by: 'أبو محمد',
    });
  });

  it('the admin takes a free room out of service and back; a busy one stays', async () => {
    const h = await hospital();
    const admin = await h.person('ADMIN', 'المدير');
    const sami = await h.person('DOCTOR', 'د. سامي');
    const free = await h.room('غرفة 1', 'AVAILABLE');
    const busy = await h.room('غرفة 2', 'IN_SURGERY');

    expect((await sami.service(free.id, true)).status).toBe(403);
    expect((await admin.service(free.id, true)).body.operatingRoom.status).toBe('OUT_OF_SERVICE');
    expect((await sami.live()).body.rooms[0].status).toBe('OUT_OF_SERVICE');
    expect((await admin.service(free.id, false)).body.operatingRoom.status).toBe('AVAILABLE');
    expect((await admin.service(busy.id, true)).status).toBe(409);
    const history = await prisma.operatingRoomStatusChange.findMany({
      where: { operatingRoomId: free.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((c) => `${c.toStatus} by ${c.changedByName}`)).toEqual([
      'OUT_OF_SERVICE by المدير',
      'AVAILABLE by المدير',
    ]);
  });
});
