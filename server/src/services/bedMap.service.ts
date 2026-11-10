import type { BedMapDepartment } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';

const natural = new Intl.Collator('en', { numeric: true });

/**
 * The live bed map (task 3.18): every department that has rooms, its rooms by
 * floor and number, and each bed's state with the patient in it. Refreshed by
 * [['rooms']], which every bed change sends to the hospital.
 */
export async function bedMap(db: ScopedPrisma): Promise<BedMapDepartment[]> {
  const departments = await db.department.findMany({
    where: { rooms: { some: {} } },
    select: {
      id: true,
      name: true,
      code: true,
      rooms: {
        select: {
          id: true,
          number: true,
          floor: true,
          beds: {
            select: {
              id: true,
              label: true,
              status: true,
              statusChangedAt: true,
              assignments: {
                where: { dischargedAt: null },
                select: {
                  admittedAt: true,
                  patient: {
                    select: {
                      id: true,
                      fullName: true,
                      isAnonymous: true,
                      gender: true,
                      dateOfBirth: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return departments.map(({ rooms, ...department }) => ({
    department,
    rooms: rooms
      .sort((a, b) => (a.floor ?? -1) - (b.floor ?? -1) || natural.compare(a.number, b.number))
      .map((room) => ({
        id: room.id,
        number: room.number,
        floor: room.floor,
        beds: room.beds
          .sort((a, b) => natural.compare(a.label, b.label))
          .map((bed) => {
            const stay = bed.assignments[0];
            return {
              id: bed.id,
              label: bed.label,
              status: bed.status,
              statusChangedAt: bed.statusChangedAt.toISOString(),
              admittedAt: stay?.admittedAt.toISOString() ?? null,
              patient: stay
                ? {
                    patientId: stay.patient.id,
                    fullName: stay.patient.fullName,
                    isAnonymous: stay.patient.isAnonymous,
                    gender: stay.patient.gender,
                    dateOfBirth: stay.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
                  }
                : null,
            };
          }),
      })),
  }));
}
