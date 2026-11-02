import type { CreateStaffData, StaffFilter, UpdateStaffData } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const staffSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  staffProfile: {
    select: {
      salary: true,
      radiologyModality: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
  doctorProfile: { select: { specialty: true, status: true } },
} as const satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

/** A flat shape for the client; the salary leaves the database as a Decimal. */
function toPublic({ staffProfile, doctorProfile, ...user }: StaffRow) {
  return {
    ...user,
    department: staffProfile?.department ?? null,
    salary: staffProfile ? Number(staffProfile.salary) : 0,
    radiologyModality: staffProfile?.radiologyModality ?? null,
    specialty: doctorProfile?.specialty ?? null,
    doctorStatus: doctorProfile?.status ?? null,
  };
}

/**
 * Everyone who works in the hospital (not patients), newest first, optionally
 * narrowed by a search over name, email and phone, a role and a department.
 */
export async function listStaff(db: ScopedPrisma, filter: StaffFilter = {}) {
  const contains = filter.search
    ? { contains: filter.search, mode: 'insensitive' as const }
    : undefined;
  const staff = await db.user.findMany({
    where: {
      role: filter.role ?? { not: 'PATIENT' },
      ...(filter.departmentId && { staffProfile: { departmentId: filter.departmentId } }),
      ...(contains && { OR: [{ fullName: contains }, { email: contains }, { phone: contains }] }),
    },
    select: staffSelect,
    orderBy: { createdAt: 'desc' },
  });
  return staff.map(toPublic);
}

/** Only employees are managed here: never admins or patients. */
async function requireEmployee(db: ScopedPrisma, id: string) {
  const user = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!user || user.role === 'ADMIN' || user.role === 'PATIENT') {
    throw new HttpError(404, 'NOT_FOUND', 'Employee not found');
  }
}

async function requireDepartment(db: ScopedPrisma, departmentId: string | null) {
  if (!departmentId) return;
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
}

/**
 * Edits an employee (task 1.28). A new password or a suspension ends every open
 * session of that employee at once, so an old password stops working everywhere.
 */
export async function updateStaff(
  db: ScopedPrisma,
  hospitalId: string,
  id: string,
  input: UpdateStaffData,
) {
  await requireEmployee(db, id);
  await requireDepartment(db, input.departmentId);
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;

  try {
    const user = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          role: input.role,
          email: input.email,
          isActive: input.isActive,
          ...(passwordHash && { passwordHash }),
        },
      });
      await tx.staffProfile.upsert({
        where: { userId: id },
        update: {
          departmentId: input.departmentId,
          salary: input.salary,
          radiologyModality: input.radiologyModality,
        },
        create: {
          hospitalId,
          userId: id,
          departmentId: input.departmentId,
          salary: input.salary,
          radiologyModality: input.radiologyModality,
        },
      });
      if (input.role === 'DOCTOR') {
        await tx.doctorProfile.upsert({
          where: { userId: id },
          update: { specialty: input.specialty ?? '' },
          create: { hospitalId, userId: id, specialty: input.specialty ?? '' },
        });
      } else {
        await tx.doctorProfile.deleteMany({ where: { userId: id } });
      }
      if (passwordHash || !input.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, select: staffSelect });
    });
    return toPublic(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'EMAIL_TAKEN', input.email);
    }
    throw error;
  }
}

/** Removes an employee and their login (profiles and sessions go with them). */
export async function deleteStaff(db: ScopedPrisma, id: string) {
  await requireEmployee(db, id);
  await db.user.delete({ where: { id } });
}

/**
 * Adds an employee with their login (task 1.27). Staff can't sign up by
 * themselves; the admin gives them an email and a password.
 */
export async function createStaff(db: ScopedPrisma, hospitalId: string, input: CreateStaffData) {
  if (input.departmentId) {
    const department = await db.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true },
    });
    if (!department) throw new HttpError(404, 'NOT_FOUND', 'Department not found');
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        hospitalId,
        role: input.role,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
        // Nested writes are not rewritten by the scoped client: hospitalId explicitly.
        staffProfile: {
          create: {
            hospitalId,
            departmentId: input.departmentId,
            salary: input.salary,
            radiologyModality: input.radiologyModality,
          },
        },
        ...(input.role === 'DOCTOR' && {
          doctorProfile: { create: { hospitalId, specialty: input.specialty ?? '' } },
        }),
      },
      select: staffSelect,
    });
    return toPublic(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'EMAIL_TAKEN', input.email);
    }
    throw error;
  }
}
