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

describe('live bed map (task 3.18)', () => {
  it('lists departments with rooms by floor, each bed with its state and patient', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const internal = await prisma.department.create({
      data: { hospitalId: id, name: 'الداخلية', code: 'INTERNAL_MEDICINE' },
    });
    // A department without rooms is not on the map.
    await prisma.department.create({
      data: { hospitalId: id, name: 'المخبر', code: 'LABORATORY' },
    });
    const room = (number: string, floor: number, beds: string[]) =>
      prisma.room.create({
        data: {
          hospitalId: id,
          departmentId: internal.id,
          number,
          floor,
          beds: { create: beds.map((label) => ({ hospitalId: id, label })) },
        },
        include: { beds: true },
      });
    await room('201', 2, ['1']);
    const r10 = await room('110', 1, ['10', '2']);
    const r9 = await room('109', 1, ['1']);
    const sara = await prisma.patient.create({ data: { hospitalId: id, fullName: 'سارة' } });
    const bed = r9.beds[0]!;
    await prisma.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
    await prisma.bedAssignment.create({
      data: { hospitalId: id, bedId: bed.id, patientId: sara.id, admittedByName: 'ريم' },
    });

    const token = (role: 'DOCTOR' | 'NURSE' | 'ADMIN' | 'PATIENT' | 'CLEANER') =>
      createUser(id, {
        email: `${role}-${crypto.randomUUID()}@nabd.test`,
        password: 'x',
        role,
      }).then((u) => ({
        Authorization: `Bearer ${signAccessToken({ sub: u.id, hospitalId: id, role })}`,
      }));
    const res = await request(app)
      .get('/api/beds/map')
      .set(await token('DOCTOR'));
    expect(res.status).toBe(200);
    expect(res.body.departments).toHaveLength(1);
    const [ward] = res.body.departments;
    expect(ward.department).toMatchObject({ id: internal.id, code: 'INTERNAL_MEDICINE' });
    expect(ward.rooms.map((r: { number: string }) => r.number)).toEqual(['109', '110', '201']);
    expect(ward.rooms[1].beds.map((b: { label: string }) => b.label)).toEqual(['2', '10']);
    expect(ward.rooms[0].beds[0]).toMatchObject({
      status: 'OCCUPIED',
      patient: { fullName: 'سارة' },
      admittedAt: expect.any(String),
    });
    expect(ward.rooms[1].beds[0]).toMatchObject({ status: 'EMPTY', patient: null });
    expect(r10.beds).toHaveLength(2);

    for (const role of ['NURSE', 'ADMIN'] as const) {
      expect(
        (
          await request(app)
            .get('/api/beds/map')
            .set(await token(role))
        ).status,
      ).toBe(200);
    }
    for (const role of ['PATIENT', 'CLEANER'] as const) {
      expect(
        (
          await request(app)
            .get('/api/beds/map')
            .set(await token(role))
        ).status,
      ).toBe(403);
    }
  });
});
