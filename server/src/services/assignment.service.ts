import type { AssignCleanerInput, AssignNurseInput } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const personSelect = { id: true, fullName: true, isActive: true } as const;

/**
 * Who covers which department (task 1.29): every department, every nurse with
 * their one department, and every cleaner with all the departments they cover.
 */
export async function getAssignments(db: ScopedPrisma) {
  const [departments, nurses, cleaners] = await Promise.all([
    db.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.user.findMany({
      where: { role: 'NURSE' },
      select: { ...personSelect, staffProfile: { select: { departmentId: true } } },
      orderBy: { fullName: 'asc' },
    }),
    db.user.findMany({
      where: { role: 'CLEANER' },
      select: { ...personSelect, cleanerAssignments: { select: { departmentId: true } } },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  return {
    departments,
    nurses: nurses.map(({ staffProfile, ...nurse }) => ({
      ...nurse,
      departmentId: staffProfile?.departmentId ?? null,
    })),
    cleaners: cleaners.map(({ cleanerAssignments, ...cleaner }) => ({
      ...cleaner,
      departmentIds: cleanerAssignments.map((assignment) => assignment.departmentId),
    })),
  };
}

async function requireRole(db: ScopedPrisma, id: string, role: 'NURSE' | 'CLEANER') {
  const user = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (user?.role !== role) throw new HttpError(404, 'NOT_FOUND', `${role} not found`);
}

/** Every id must be a department of this hospital. */
async function requireDepartments(db: ScopedPrisma, ids: string[]) {
  if (ids.length === 0) return;
  const found = await db.department.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
}

/** Moves a nurse to another department; what kind of nurse they are follows it. */
export async function assignNurse(
  db: ScopedPrisma,
  hospitalId: string,
  id: string,
  { departmentId }: AssignNurseInput,
) {
  await requireRole(db, id, 'NURSE');
  await requireDepartments(db, [departmentId]);
  await db.staffProfile.upsert({
    where: { userId: id },
    update: { departmentId },
    create: { hospitalId, userId: id, departmentId },
  });
  return { id, departmentId };
}

/** Replaces the set of departments a cleaner covers. */
export async function assignCleaner(
  db: ScopedPrisma,
  hospitalId: string,
  id: string,
  { departmentIds }: AssignCleanerInput,
) {
  await requireRole(db, id, 'CLEANER');
  await requireDepartments(db, departmentIds);
  await db.$transaction(async (tx) => {
    await tx.cleanerAssignment.deleteMany({
      where: { userId: id, departmentId: { notIn: departmentIds } },
    });
    await tx.cleanerAssignment.createMany({
      data: departmentIds.map((departmentId) => ({ hospitalId, userId: id, departmentId })),
      skipDuplicates: true,
    });
  });
  return { id, departmentIds };
}
