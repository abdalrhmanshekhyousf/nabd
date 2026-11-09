import type { DepartmentCode } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';

/**
 * The wards' rooms and beds (for tasks 3.15–3.18): each department that keeps
 * patients gets a floor of rooms; the ER a resuscitation room and an
 * observation room. Only when the hospital has no rooms yet, so the admin's
 * own layout is never touched. All beds start empty.
 */
const WARDS: { code: DepartmentCode; floor: number | null; rooms: [string, number][] }[] = [
  {
    code: 'EMERGENCY',
    floor: 0,
    rooms: [
      ['إنعاش', 2],
      ['مراقبة', 6],
    ],
  },
  {
    code: 'INTERNAL_MEDICINE',
    floor: 1,
    rooms: [
      ['101', 4],
      ['102', 4],
      ['103', 2],
    ],
  },
  {
    code: 'CARDIOLOGY',
    floor: 2,
    rooms: [
      ['201', 4],
      ['202', 2],
      ['203', 1],
    ],
  },
  {
    code: 'NEUROLOGY',
    floor: 2,
    rooms: [
      ['211', 3],
      ['212', 2],
    ],
  },
  {
    code: 'ORTHOPEDICS',
    floor: 3,
    rooms: [
      ['301', 4],
      ['302', 4],
    ],
  },
  {
    code: 'PLASTIC_SURGERY',
    floor: 3,
    rooms: [
      ['311', 2],
      ['312', 1],
    ],
  },
  {
    code: 'GYNECOLOGY',
    floor: 4,
    rooms: [
      ['401', 4],
      ['402', 2],
      ['403', 1],
    ],
  },
  { code: 'OPHTHALMOLOGY', floor: 4, rooms: [['411', 2]] },
];

export async function seedWards(hospitalId: string) {
  if (await prisma.room.count({ where: { hospitalId } })) return false;
  const departments = await prisma.department.findMany({ where: { hospitalId } });
  for (const { code, floor, rooms } of WARDS) {
    const departmentId = departments.find((d) => d.code === code)?.id;
    if (!departmentId) continue;
    for (const [number, beds] of rooms) {
      await prisma.room.create({
        data: {
          hospitalId,
          departmentId,
          number,
          floor,
          beds: {
            create: Array.from({ length: beds }, (_, i) => ({ hospitalId, label: String(i + 1) })),
          },
        },
      });
    }
  }
  return true;
}
