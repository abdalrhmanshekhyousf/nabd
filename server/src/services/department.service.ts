import { DEPARTMENT_CODES, type DepartmentCode } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

// Stored names of the built-in departments (the hospital's working language).
// Clients translate built-in departments by their code, not by this name.
const DEFAULT_NAMES: Record<DepartmentCode, string> = {
  EMERGENCY: 'الإسعاف',
  OPERATIONS: 'العمليات',
  INTERNAL_MEDICINE: 'الداخلية',
  NEUROLOGY: 'العصبية',
  ORTHOPEDICS: 'العظمية',
  CARDIOLOGY: 'القلبية',
  PLASTIC_SURGERY: 'الجراحة التجميلية',
  OPHTHALMOLOGY: 'العينية',
  GYNECOLOGY: 'النسائية',
  LABORATORY: 'المخبر',
  RADIOLOGY: 'الأشعة',
  PHARMACY: 'الصيدلية',
};

const departmentSelect = {
  id: true,
  name: true,
  code: true,
  createdAt: true,
  _count: { select: { rooms: true, staff: true } },
} as const;

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

function toPublic({ _count, ...department }: DepartmentRow) {
  return { ...department, roomCount: _count.rooms, staffCount: _count.staff };
}

/** Built-in departments first, in the report's order, then custom ones by name. */
function sortDepartments(rows: DepartmentRow[]) {
  const order = (row: DepartmentRow) =>
    row.code ? DEPARTMENT_CODES.indexOf(row.code) : DEPARTMENT_CODES.length;
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'ar'));
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function listDepartments(db: ScopedPrisma) {
  return sortDepartments(await db.department.findMany({ select: departmentSelect })).map(toPublic);
}

export async function createDepartment(db: ScopedPrisma, hospitalId: string, name: string) {
  try {
    return toPublic(
      await db.department.create({ data: { hospitalId, name }, select: departmentSelect }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'DEPARTMENT_EXISTS', name);
    throw error;
  }
}

/**
 * Adds every built-in department the hospital doesn't have yet (by code). A
 * custom department that already uses a built-in name is left alone.
 */
export async function addDefaultDepartments(db: ScopedPrisma, hospitalId: string) {
  const existing = await db.department.findMany({ select: { code: true, name: true } });
  const codes = new Set(existing.map((row) => row.code));
  const names = new Set(existing.map((row) => row.name));
  const missing = DEPARTMENT_CODES.filter(
    (code) => !codes.has(code) && !names.has(DEFAULT_NAMES[code]),
  );

  if (missing.length > 0) {
    await db.department.createMany({
      data: missing.map((code) => ({ hospitalId, code, name: DEFAULT_NAMES[code] })),
      skipDuplicates: true,
    });
  }
  return { added: missing.length, departments: await listDepartments(db) };
}

/** Renames a custom department. Built-in ones keep their translated name. */
export async function renameDepartment(db: ScopedPrisma, id: string, name: string) {
  const department = await db.department.findUnique({ where: { id }, select: { code: true } });
  if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
  if (department.code) {
    throw new HttpError(403, 'FORBIDDEN', 'Built-in departments cannot be renamed');
  }
  try {
    return toPublic(
      await db.department.update({ where: { id }, data: { name }, select: departmentSelect }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'DEPARTMENT_EXISTS', name);
    throw error;
  }
}

/** Deletes a department that has no rooms and no staff, so nothing is lost by accident. */
export async function deleteDepartment(db: ScopedPrisma, id: string) {
  const department = await db.department.findUnique({ where: { id }, select: departmentSelect });
  if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
  const { rooms, staff } = department._count;
  if (rooms > 0 || staff > 0) {
    throw new HttpError(409, 'DEPARTMENT_IN_USE', `${rooms} rooms, ${staff} staff`, {
      roomCount: rooms,
      staffCount: staff,
    });
  }
  await db.department.delete({ where: { id } });
}
