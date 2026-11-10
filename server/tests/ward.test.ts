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
  const department = (code: 'INTERNAL_MEDICINE' | 'CARDIOLOGY', name: string) =>
    prisma.department.create({ data: { hospitalId: id, name, code } });
  const internal = await department('INTERNAL_MEDICINE', 'الداخلية');
  const cardio = await department('CARDIOLOGY', 'القلبية');
  const room = (departmentId: string, number: string, beds: number) =>
    prisma.room.create({
      data: {
        hospitalId: id,
        departmentId,
        number,
        beds: {
          create: Array.from({ length: beds }, (_, i) => ({
            hospitalId: id,
            label: String(i + 1),
          })),
        },
      },
      include: { beds: { orderBy: { label: 'asc' } } },
    });
  const r101 = await room(internal.id, '101', 3);
  const r201 = await room(cardio.id, '201', 1);

  async function nurse(fullName: string, departmentId: string | null) {
    const user = await createUser(id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { fullName, staffProfile: { create: { hospitalId: id, departmentId } } },
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'NURSE' })}`,
    };
    const post = (path: string, body: object = {}) =>
      request(app).post(`/api/ward${path}`).set(auth).send(body);
    return {
      ...user,
      board: () => request(app).get('/api/ward/board').set(auth),
      find: (search: string) => request(app).get('/api/ward/patients').query({ search }).set(auth),
      admit: (body: object) => post('/admissions', { notes: null, ...body }),
      move: (stayId: string, bedId: string) => post(`/stays/${stayId}/move`, { bedId }),
      discharge: (stayId: string) => post(`/stays/${stayId}/discharge`, { notes: null }),
      setBed: (bedId: string, to: string) => post(`/beds/${bedId}/status`, { to, reason: null }),
    };
  }
  const patient = (fullName: string) =>
    prisma.patient.create({
      data: { hospitalId: id, fullName, medicalRecord: { create: { hospitalId: id } } },
    });
  const bedOf = async (bedId: string) =>
    (await prisma.bed.findUniqueOrThrow({ where: { id: bedId } })).status;
  async function cleaner(fullName: string, departmentId: string) {
    const user = await createUser(id, {
      email: `c-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'CLEANER',
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    await prisma.cleanerAssignment.create({
      data: { hospitalId: id, userId: user.id, departmentId },
    });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role: 'CLEANER' })}`,
    };
    return {
      ...user,
      jobs: () => request(app).get('/api/cleaning-requests').set(auth),
      start: (jobId: string) =>
        request(app).post(`/api/cleaning-requests/${jobId}/start`).set(auth),
      finish: (jobId: string) =>
        request(app).post(`/api/cleaning-requests/${jobId}/finish`).set(auth),
    };
  }
  return { id, internal, cardio, r101, r201, nurse, cleaner, patient, bedOf };
}

describe('ward board (task 3.16)', () => {
  it('admits a patient found by name; the board shows who is in which bed', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const sara = await h.patient('سارة الأحمد');
    const bed = h.r101.beds[0]!;

    expect(
      (await reem.find('سارة')).body.patients.map((p: { patientId: string }) => p.patientId),
    ).toEqual([sara.id]);
    const res = await reem.admit({ bedId: bed.id, patientId: sara.id, notes: 'التهاب رئة' });
    expect(res.status).toBe(201);
    expect(await h.bedOf(bed.id)).toBe('OCCUPIED');

    const { body } = await reem.board();
    expect(body.department).toMatchObject({ id: h.internal.id });
    expect(body.rooms).toHaveLength(1);
    const beds = body.rooms[0].beds;
    expect(beds.map((b: { label: string }) => b.label)).toEqual(['1', '2', '3']);
    expect(beds[0]).toMatchObject({
      status: 'OCCUPIED',
      stay: {
        patient: { fullName: 'سارة الأحمد' },
        notes: 'التهاب رئة',
        admittedByName: 'ريم',
        fromEr: false,
      },
    });
    expect(beds[1].stay).toBeNull();
    // Already in a bed: not offered again, and refused.
    expect((await reem.find('سارة')).body.patients).toEqual([]);
    const again = await reem.admit({ bedId: h.r101.beds[1]!.id, patientId: sara.id });
    expect(again.body.error.code).toBe('ALREADY_ADMITTED');
    // Taken bed: refused.
    const omar = await h.patient('عمر');
    expect((await reem.admit({ bedId: bed.id, patientId: omar.id })).body.error.code).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('a patient the ER transferred waits on the board until admitted', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const sara = await h.patient('سارة');
    const visit = await prisma.triageAssessment.create({
      data: {
        hospitalId: h.id,
        patientId: sara.id,
        status: 'TRANSFERRED',
        level: 2,
        chiefComplaint: 'ضيق نفس',
        closingNote: 'أكسجين 2 ليتر',
        departmentId: h.internal.id,
        closedAt: new Date(),
      },
    });
    const waiting = (await reem.board()).body.incoming;
    expect(waiting).toEqual([
      expect.objectContaining({
        visitId: visit.id,
        level: 2,
        chiefComplaint: 'ضيق نفس',
        closingNote: 'أكسجين 2 ليتر',
        patient: expect.objectContaining({ fullName: 'سارة' }),
      }),
    ]);
    expect((await reem.admit({ bedId: h.r101.beds[2]!.id, visitId: visit.id })).status).toBe(201);
    const board = (await reem.board()).body;
    expect(board.incoming).toEqual([]);
    expect(board.rooms[0].beds[2].stay).toMatchObject({ fromEr: true });
  });

  it('moving sends the old bed to cleaning; discharging ends the stay and cleans the bed', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const sara = await h.patient('سارة');
    const [b1, b2] = h.r101.beds;
    const { stayId } = (await reem.admit({ bedId: b1!.id, patientId: sara.id })).body;

    expect((await reem.move(stayId, b2!.id)).status).toBe(200);
    expect([await h.bedOf(b1!.id), await h.bedOf(b2!.id)]).toEqual(['CLEANING', 'OCCUPIED']);
    expect((await reem.move(stayId, b1!.id)).body.error.code).toBe('INVALID_TRANSITION');

    expect((await reem.discharge(stayId)).status).toBe(200);
    expect(await h.bedOf(b2!.id)).toBe('CLEANING');
    const stay = await prisma.bedAssignment.findUniqueOrThrow({ where: { id: stayId } });
    expect(stay).toMatchObject({ bedId: b2!.id, dischargedByName: 'ريم' });
    expect(stay.dischargedAt).not.toBeNull();
    expect((await reem.discharge(stayId)).status).toBe(404);

    // The history keeps the stay's patient on each bed.
    const changes = await prisma.bedStatusChange.findMany({
      where: { assignmentId: stayId },
      orderBy: { createdAt: 'asc' },
    });
    expect(changes.map((c) => `${c.toStatus}:${c.reason ?? ''}`)).toEqual([
      'OCCUPIED:',
      'OCCUPIED:',
      'CLEANING:MOVED',
      'CLEANING:DISCHARGED',
    ]);
    // Free again for someone else once discharged.
    expect((await reem.find('سارة')).body.patients).toHaveLength(1);
  });

  it('holds and frees beds by hand; a nurse only touches her own ward', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const lama = await h.nurse('لمى', h.cardio.id);
    const nobody = await h.nurse('بلا قسم', null);
    const bed = h.r101.beds[0]!;

    expect((await reem.setBed(bed.id, 'RESERVED')).status).toBe(200);
    expect(await h.bedOf(bed.id)).toBe('RESERVED');
    expect((await reem.setBed(bed.id, 'EMPTY')).status).toBe(200);
    expect((await reem.setBed(bed.id, 'OCCUPIED')).status).toBe(400);

    expect((await lama.setBed(bed.id, 'RESERVED')).status).toBe(404);
    const sara = await h.patient('سارة');
    expect((await lama.admit({ bedId: bed.id, patientId: sara.id })).status).toBe(404);
    expect((await lama.board()).body.rooms[0].number).toBe('201');
    expect((await nobody.board()).status).toBe(403);
  });

  it('two nurses admitting into the same bed at once: one wins', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const [a, b] = [await h.patient('أ'), await h.patient('ب')];
    const bed = h.r101.beds[0]!;
    const results = await Promise.all([
      reem.admit({ bedId: bed.id, patientId: a.id }),
      reem.admit({ bedId: bed.id, patientId: b.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.bedAssignment.count({ where: { bedId: bed.id } })).toBe(1);
  });

  it('a discharge calls the ward cleaners; finishing brings the bed back empty (task 3.17)', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const suad = await h.cleaner('سعاد', h.internal.id);
    const other = await h.cleaner('سمير', h.cardio.id);
    const sara = await h.patient('سارة');
    const bed = h.r101.beds[1]!;
    const { stayId } = (await reem.admit({ bedId: bed.id, patientId: sara.id })).body;
    await reem.discharge(stayId);

    const jobs = (await suad.jobs()).body.requests;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: 'CLEANING',
      status: 'PENDING',
      bed: { id: bed.id, label: '2', room: '101' },
      note: 'DISCHARGED',
      requestedBy: 'ريم',
    });
    expect((await other.jobs()).body.requests).toEqual([]);
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: suad.id } });
    expect(notice).toMatchObject({
      type: 'BED_DISCHARGED',
      data: { room: '101', bed: '2', reason: 'DISCHARGED' },
      link: '/cleaning/tasks',
    });
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(0);

    await suad.start(jobs[0].id);
    expect(await h.bedOf(bed.id)).toBe('CLEANING');
    expect((await suad.finish(jobs[0].id)).status).toBe(200);
    expect(await h.bedOf(bed.id)).toBe('EMPTY');
    const last = await prisma.bedStatusChange.findFirstOrThrow({
      where: { bedId: bed.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(last).toMatchObject({
      fromStatus: 'CLEANING',
      toStatus: 'EMPTY',
      reason: 'CLEANED',
      changedByName: 'سعاد',
    });
  });

  it('a move cleans the old bed; one open job per bed; cleaning by hand withdraws a waiting job', async () => {
    const h = await hospital();
    const reem = await h.nurse('ريم', h.internal.id);
    const suad = await h.cleaner('سعاد', h.internal.id);
    const [b1, b2] = h.r101.beds;
    const sara = await h.patient('سارة');
    const { stayId } = (await reem.admit({ bedId: b1!.id, patientId: sara.id })).body;
    await reem.move(stayId, b2!.id);
    let jobs = (await suad.jobs()).body.requests;
    expect(jobs.map((j: { bed: { id: string }; note: string }) => [j.bed.id, j.note])).toEqual([
      [b1!.id, 'MOVED'],
    ]);

    // The nurse marks it clean before anyone started: the job is withdrawn.
    await reem.setBed(b1!.id, 'EMPTY');
    jobs = (await suad.jobs()).body.requests;
    expect(jobs).toEqual([]);

    // A started job is kept; finishing it leaves a bed a nurse already freed as it is.
    await reem.discharge(stayId);
    const [job] = (await suad.jobs()).body.requests;
    await suad.start(job.id);
    await reem.setBed(b2!.id, 'EMPTY');
    const omar = await h.patient('عمر');
    await reem.admit({ bedId: b2!.id, patientId: omar.id });
    expect((await suad.finish(job.id)).status).toBe(200);
    expect(await h.bedOf(b2!.id)).toBe('OCCUPIED');
  });
});
