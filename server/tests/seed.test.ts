import { isOverdue } from '@nabd/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { seedDemo } from '../prisma/demo.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { getQueue } from '../src/services/er.service.js';

const details = {
  name: `مستشفى تجربة البذور ${crypto.randomUUID()}`,
  address: 'دمشق',
  phone: '+963 11 000 0000',
  email: 'seed@nabd.test',
};
let hospitalId = '';

afterAll(async () => {
  if (hospitalId) await prisma.hospital.delete({ where: { id: hospitalId } });
  await prisma.$disconnect();
});

describe('the demo seed (task 2.27)', () => {
  it('fills the hospital with teams and a lively ER and operating rooms, once', async () => {
    const first = await seedDemo(details);
    hospitalId = first.hospital.id;
    expect(first.activity).toBe(true);

    const doctors = await prisma.doctorProfile.findMany({
      where: { hospitalId },
      select: { status: true },
    });
    expect(new Set(doctors.map((d) => d.status))).toEqual(
      new Set(['AVAILABLE', 'BUSY', 'ON_LEAVE']),
    );
    // Every clinical department: three doctors and three nurses; every
    // department: two cleaners.
    const departments = await prisma.department.findMany({
      where: { hospitalId },
      select: {
        code: true,
        staff: { select: { user: { select: { role: true } } } },
        cleaners: { select: { userId: true } },
      },
    });
    expect(departments).toHaveLength(12);
    for (const { code, staff, cleaners } of departments) {
      const of = (role: string) => staff.filter((s) => s.user.role === role).length;
      const clinical = !['LABORATORY', 'RADIOLOGY', 'PHARMACY'].includes(code!);
      expect({
        code,
        doctors: of('DOCTOR'),
        nurses: of('NURSE'),
        cleaners: cleaners.length,
      }).toEqual({
        code,
        doctors: clinical ? 3 : 0,
        nurses: clinical ? 3 : 0,
        cleaners: 2,
      });
    }

    // One not assessed yet (on top, to assess first), then every level, the urgent ones late.
    const queue = await getQueue(forHospital(hospitalId));
    expect(queue.map((v) => v.level)).toEqual([null, 1, 2, 3, 4, 5]);
    const late = queue.filter((v) => isOverdue(v.level, v.arrivedAt)).map((v) => v.level);
    expect(late).toEqual(expect.arrayContaining([2, 3]));
    expect(queue[1]).toMatchObject({ status: 'IN_TREATMENT', patient: { isAnonymous: true } });

    const rooms = await prisma.operatingRoom.findMany({
      where: { hospitalId },
      orderBy: { name: 'asc' },
    });
    expect(rooms.map((r) => r.status)).toEqual(['IN_SURGERY', 'BOOKED', 'AWAITING_STERILIZATION']);
    expect(
      await prisma.cleaningRequest.findMany({
        where: { hospitalId },
        select: { kind: true, status: true },
        orderBy: { kind: 'asc' },
      }),
    ).toEqual([
      { kind: 'CLEANING', status: 'PENDING' },
      { kind: 'STERILIZATION', status: 'PENDING' },
    ]);
    const types = await prisma.notification.groupBy({
      by: ['type'],
      where: { hospitalId },
      _count: true,
    });
    expect(types.map((t) => t.type).sort()).toEqual([
      'CLEANING_REQUEST',
      'DOCTOR_CALL',
      'OPERATION_ENDED',
    ]);

    // Running it again adds nobody and nothing.
    const count = () =>
      Promise.all([
        prisma.user.count({ where: { hospitalId } }),
        prisma.triageAssessment.count({ where: { hospitalId } }),
        prisma.operationBooking.count({ where: { hospitalId } }),
        prisma.cleanerAssignment.count({ where: { hospitalId } }),
      ]);
    const before = await count();
    const again = await seedDemo(details);
    expect(again).toMatchObject({ activity: false, hospital: { id: hospitalId } });
    expect(await count()).toEqual(before);
  });
});
