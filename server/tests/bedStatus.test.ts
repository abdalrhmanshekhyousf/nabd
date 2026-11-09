import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { changeBedStatus } from '../src/services/bedStatus.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function ward() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const department = await prisma.department.create({
    data: { hospitalId: id, name: 'الباطنية', code: 'INTERNAL_MEDICINE' },
  });
  const room = await prisma.room.create({
    data: {
      hospitalId: id,
      departmentId: department.id,
      number: '101',
      beds: {
        create: [
          { hospitalId: id, label: '1' },
          { hospitalId: id, label: '2' },
        ],
      },
    },
    include: { beds: { orderBy: { label: 'asc' } } },
  });
  async function person(role: 'ADMIN' | 'NURSE' | 'DOCTOR', fullName: string) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      history: (bedId: string) => request(app).get(`/api/beds/${bedId}/history`).set(auth),
      service: (bedId: string, outOfService: boolean) =>
        request(app).patch(`/api/beds/${bedId}`).set(auth).send({ outOfService }),
    };
  }
  const db = forHospital(id);
  const move = (bedId: string, to: Parameters<typeof changeBedStatus>[1]['to'], actorId: string) =>
    db.$transaction((tx) => changeBedStatus(tx, { hospitalId: id, bedId, to, actorId }));
  return { id, db, beds: room.beds, person, move };
}

describe('bed states and their history (task 3.15)', () => {
  it('follows the cycle empty → occupied → cleaning → empty, each step logged', async () => {
    const h = await ward();
    const nurse = await h.person('NURSE', 'ريم');
    const bed = h.beds[0]!;

    await h.move(bed.id, 'OCCUPIED', nurse.id);
    await h.move(bed.id, 'CLEANING', nurse.id);
    await h.move(bed.id, 'EMPTY', nurse.id);

    const { body } = await nurse.history(bed.id);
    expect(
      body.history.map(
        (c: { fromStatus: string; toStatus: string }) => `${c.fromStatus}→${c.toStatus}`,
      ),
    ).toEqual(['CLEANING→EMPTY', 'OCCUPIED→CLEANING', 'EMPTY→OCCUPIED']);
    expect(body.history[0].changedByName).toBe('ريم');
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } })).status).toBe('EMPTY');
  });

  it('refuses moves outside the cycle and leaves the bed and history as they were', async () => {
    const h = await ward();
    const nurse = await h.person('NURSE', 'ريم');
    const bed = h.beds[0]!;
    await h.move(bed.id, 'OCCUPIED', nurse.id);

    await expect(h.move(bed.id, 'EMPTY', nurse.id)).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    });
    await expect(h.move(bed.id, 'OUT_OF_SERVICE', nurse.id)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } })).status).toBe('OCCUPIED');
    expect(await prisma.bedStatusChange.count({ where: { bedId: bed.id } })).toBe(1);
  });

  it('two nurses at once: only one takes the empty bed', async () => {
    const h = await ward();
    const nurse = await h.person('NURSE', 'ريم');
    const bed = h.beds[0]!;
    const results = await Promise.allSettled([
      h.move(bed.id, 'OCCUPIED', nurse.id),
      h.move(bed.id, 'OCCUPIED', nurse.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.bedStatusChange.count({ where: { bedId: bed.id } })).toBe(1);
  });

  it("the admin's out-of-service goes through the same log; a bed of another hospital is not found", async () => {
    const h = await ward();
    const admin = await h.person('ADMIN', 'المدير');
    const doctor = await h.person('DOCTOR', 'د. سامي');
    const bed = h.beds[1]!;
    expect((await admin.service(bed.id, true)).status).toBe(200);
    expect((await admin.service(bed.id, false)).status).toBe(200);
    const { body } = await admin.history(bed.id);
    expect(body.history.map((c: { toStatus: string }) => c.toStatus)).toEqual([
      'EMPTY',
      'OUT_OF_SERVICE',
    ]);
    expect(body.history[0].changedByName).toBe('المدير');

    expect((await doctor.history(bed.id)).status).toBe(403);
    const other = await ward();
    await expect(other.move(bed.id, 'OCCUPIED', admin.id)).rejects.toMatchObject({ status: 404 });
    const otherAdmin = await other.person('ADMIN', 'مدير تاني');
    expect((await otherAdmin.history(bed.id)).status).toBe(404);
  });

  it('one open stay per bed and per patient (database rule)', async () => {
    const h = await ward();
    const nurse = await h.person('NURSE', 'ريم');
    const patient = await prisma.patient.create({ data: { hospitalId: h.id, fullName: 'سارة' } });
    const stay = (bedId: string) =>
      prisma.bedAssignment.create({
        data: {
          hospitalId: h.id,
          bedId,
          patientId: patient.id,
          admittedById: nurse.id,
          admittedByName: 'ريم',
        },
      });
    const first = await stay(h.beds[0]!.id);
    await expect(stay(h.beds[1]!.id)).rejects.toThrow();
    await prisma.bedAssignment.update({
      where: { id: first.id },
      data: { dischargedAt: new Date() },
    });
    expect((await stay(h.beds[1]!.id)).id).toBeTruthy();
  });
});
