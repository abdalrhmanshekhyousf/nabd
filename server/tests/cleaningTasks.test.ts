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
  const [er, operations, ward] = await Promise.all(
    (['EMERGENCY', 'OPERATIONS', 'CARDIOLOGY'] as const).map((code) =>
      prisma.department.create({ data: { hospitalId: id, name: code, code } }),
    ),
  );
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
    const token = signAccessToken({ sub: user.id, hospitalId: id, role: 'CLEANER' });
    const auth = { Authorization: `Bearer ${token}` };
    return {
      ...user,
      board: () => request(app).get('/api/cleaning-requests').set(auth),
      start: (requestId: string) =>
        request(app).post(`/api/cleaning-requests/${requestId}/start`).set(auth),
      finish: (requestId: string) =>
        request(app).post(`/api/cleaning-requests/${requestId}/finish`).set(auth),
      step: (roomId: string, to: string) =>
        request(app).post(`/api/operating-rooms/${roomId}/transition`).set(auth).send({ to }),
    };
  }
  /** An operating room whose operation just ended, with its sterilization request. */
  async function endedRoom(name = 'غرفة 1') {
    const room = await prisma.operatingRoom.create({
      data: { hospitalId: id, name, status: 'AWAITING_STERILIZATION' },
    });
    const job = await prisma.cleaningRequest.create({
      data: {
        hospitalId: id,
        departmentId: operations.id,
        kind: 'STERILIZATION',
        operatingRoomId: room.id,
        place: name,
      },
    });
    return { room, job };
  }
  const job = (departmentId: string, place: string) =>
    prisma.cleaningRequest.create({ data: { hospitalId: id, departmentId, place } });
  async function nurse(fullName: string, departmentId: string | null) {
    const user = await createUser(id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    await prisma.staffProfile.create({ data: { hospitalId: id, userId: user.id, departmentId } });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'NURSE' })}`,
    };
    return {
      ...user,
      ask: (body: object) =>
        request(app)
          .post('/api/cleaning-requests')
          .set(auth)
          .send({ note: null, ...body }),
      list: () => request(app).get('/api/cleaning-requests/department').set(auth),
      cancel: (requestId: string) =>
        request(app).delete(`/api/cleaning-requests/${requestId}`).set(auth),
    };
  }
  return { id, er, operations, ward, cleaner, endedRoom, job, nurse };
}

const roomStatus = async (id: string) =>
  (await prisma.operatingRoom.findUniqueOrThrow({ where: { id } })).status;

describe('cleaner board (task 2.24)', () => {
  it('lists open jobs of my departments only, sterilizations first', async () => {
    const h = await hospital();
    const abu = await h.cleaner('أبو محمد', [h.operations.id, h.er.id]);
    const corridor = await h.job(h.er.id, 'ممر الإسعاف');
    await h.job(h.ward.id, 'غرفة 12');
    const { job } = await h.endedRoom();

    const res = await abu.board();

    expect(res.status).toBe(200);
    expect(res.body.requests.map((r: { id: string }) => r.id)).toEqual([job.id, corridor.id]);
    expect(res.body.requests[0]).toMatchObject({
      kind: 'STERILIZATION',
      status: 'PENDING',
      place: 'غرفة 1',
      operatingRoom: { name: 'غرفة 1' },
      department: { code: 'OPERATIONS' },
      mine: false,
    });
  });

  it('sterilizing: start takes it and the room sterilizes; finish frees the room', async () => {
    const h = await hospital();
    const abu = await h.cleaner('أبو محمد', [h.operations.id]);
    const sami = await h.cleaner('سامي', [h.operations.id]);
    const { room, job } = await h.endedRoom();

    const started = await abu.start(job.id);
    expect(started.body.request).toMatchObject({
      status: 'IN_PROGRESS',
      mine: true,
      assignedTo: { fullName: 'أبو محمد' },
    });
    expect(await roomStatus(room.id)).toBe('STERILIZING');

    const late = await sami.start(job.id);
    expect(late.status).toBe(409);
    expect(late.body.error).toMatchObject({ code: 'ALREADY_TAKEN', details: { by: 'أبو محمد' } });
    expect((await sami.finish(job.id)).status).toBe(403);

    const finished = await abu.finish(job.id);
    expect(finished.body.request).toMatchObject({ status: 'DONE', finishedAt: expect.any(String) });
    expect(await roomStatus(room.id)).toBe('AVAILABLE');
    expect((await abu.board()).body.requests).toEqual([
      expect.objectContaining({ id: job.id, status: 'DONE' }),
    ]);
    expect((await sami.board()).body.requests).toEqual([]);
    const history = await prisma.operatingRoomStatusChange.findMany({
      where: { operatingRoomId: room.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((c) => `${c.toStatus} by ${c.changedByName}`)).toEqual([
      'STERILIZING by أبو محمد',
      'AVAILABLE by أبو محمد',
    ]);
  });

  it('a sterilized room with an operation still waiting is booked again for it', async () => {
    const h = await hospital();
    const abu = await h.cleaner('أبو محمد', [h.operations.id]);
    const { room, job } = await h.endedRoom();
    const patient = await prisma.patient.create({ data: { hospitalId: h.id, fullName: 'سارة' } });
    const next = await prisma.operationBooking.create({
      data: {
        hospitalId: h.id,
        operatingRoomId: room.id,
        patientId: patient.id,
        surgeonName: 'د. سامي',
        procedure: 'استئصال زائدة',
        startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 7_200_000),
      },
    });

    await abu.start(job.id);
    await abu.finish(job.id);

    expect(await roomStatus(room.id)).toBe('BOOKED');
    expect(
      await prisma.operatingRoomStatusChange.findFirst({
        where: { operatingRoomId: room.id },
        orderBy: { createdAt: 'desc' },
      }),
    ).toMatchObject({ fromStatus: 'AVAILABLE', toStatus: 'BOOKED', bookingId: next.id });
  });

  it('a plain cleaning job is started and finished without any room', async () => {
    const h = await hospital();
    const umm = await h.cleaner('أم علي', [h.er.id]);
    const corridor = await h.job(h.er.id, 'ممر الإسعاف');

    expect((await umm.finish(corridor.id)).status).toBe(409);
    expect((await umm.start(corridor.id)).body.request.status).toBe('IN_PROGRESS');
    expect((await umm.finish(corridor.id)).body.request.status).toBe('DONE');
    expect((await umm.start(corridor.id)).status).toBe(409);
    const other = await h.job(h.ward.id, 'غرفة 12');
    expect((await umm.start(other.id)).status).toBe(404);
  });

  it('two cleaners taking the same job at once: one gets it', async () => {
    const h = await hospital();
    const abu = await h.cleaner('أبو محمد', [h.operations.id]);
    const sami = await h.cleaner('سامي', [h.operations.id]);
    const { job } = await h.endedRoom();

    const results = await Promise.all([abu.start(job.id), sami.start(job.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('sterilizing from the room itself keeps the request in step', async () => {
    const h = await hospital();
    const abu = await h.cleaner('أبو محمد', [h.operations.id]);
    const { room, job } = await h.endedRoom();

    expect((await abu.step(room.id, 'STERILIZING')).status).toBe(200);
    expect(await prisma.cleaningRequest.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject(
      { status: 'IN_PROGRESS', assignedToId: abu.id },
    );
    await abu.step(room.id, 'AVAILABLE');
    expect((await prisma.cleaningRequest.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      'DONE',
    );
  });
});

describe('cleaning requests from nurses (task 2.25)', () => {
  it('a nurse asks for her department; its cleaners are told and see it', async () => {
    const h = await hospital();
    const salma = await h.nurse('سلمى', h.ward.id);
    const umm = await h.cleaner('أم علي', [h.ward.id]);
    const abu = await h.cleaner('أبو محمد', [h.er.id]);

    const res = await salma.ask({ place: 'غرفة 12', note: 'انسكب دوا عالأرض' });

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      kind: 'CLEANING',
      status: 'PENDING',
      place: 'غرفة 12',
      note: 'انسكب دوا عالأرض',
      requestedBy: 'سلمى',
      department: { code: 'CARDIOLOGY' },
    });
    expect(await prisma.notification.findMany({ where: { userId: umm.id } })).toEqual([
      expect.objectContaining({
        type: 'CLEANING_REQUEST',
        urgent: false,
        data: { place: 'غرفة 12' },
        link: '/cleaning/tasks',
      }),
    ]);
    expect(await prisma.notification.count({ where: { userId: abu.id } })).toBe(0);
    expect((await umm.board()).body.requests.map((r: { place: string }) => r.place)).toEqual([
      'غرفة 12',
    ]);
    expect((await abu.board()).body.requests).toEqual([]);
  });

  it('nurses of the department follow its requests; the asker may cancel hers until started', async () => {
    const h = await hospital();
    const salma = await h.nurse('سلمى', h.ward.id);
    const huda = await h.nurse('هدى', h.ward.id);
    const lina = await h.nurse('لينا', h.er.id);
    const umm = await h.cleaner('أم علي', [h.ward.id]);
    const first = (await salma.ask({ place: 'غرفة 12' })).body.request;
    const second = (await salma.ask({ place: 'الممر' })).body.request;

    const seen = (await huda.list()).body.requests;
    expect(seen.map((r: { place: string; mine: boolean }) => [r.place, r.mine])).toEqual([
      ['الممر', false],
      ['غرفة 12', false],
    ]);
    expect((await lina.list()).body.requests).toEqual([]);
    expect((await huda.cancel(first.id)).status).toBe(404);

    await umm.start(first.id);
    expect((await salma.cancel(first.id)).status).toBe(409);
    expect((await salma.cancel(second.id)).body.request.status).toBe('CANCELLED');
    expect((await umm.board()).body.requests.map((r: { place: string }) => r.place)).toEqual([
      'غرفة 12',
    ]);
    expect((await salma.list()).body.requests[1]).toMatchObject({
      place: 'غرفة 12',
      status: 'IN_PROGRESS',
      assignedTo: { fullName: 'أم علي' },
      mine: true,
    });
  });

  it('a nurse without a department, or an empty place, is refused', async () => {
    const h = await hospital();
    expect((await (await h.nurse('ريم', null)).ask({ place: 'الممر' })).status).toBe(403);
    expect((await (await h.nurse('سلمى', h.ward.id)).ask({ place: '  ' })).status).toBe(400);
  });
});
