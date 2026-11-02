import type { CreateStaffData } from '@nabd/shared';
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

/** Everyone who works in the hospital (not patients), newest first. */
export async function listStaff(db: ScopedPrisma) {
  const staff = await db.user.findMany({
    where: { role: { not: 'PATIENT' } },
    select: staffSelect,
    orderBy: { createdAt: 'desc' },
  });
  return staff.map(toPublic);
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
