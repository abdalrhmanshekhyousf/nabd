import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import type { Role } from '../src/generated/prisma/enums.js';

/** Creates an isolated hospital for one test; delete it to clean up (cascades). */
export async function createHospital(name = `Test hospital ${crypto.randomUUID()}`) {
  return prisma.hospital.create({ data: { name, address: 'Damascus', phone: '000' } });
}

export async function createUser(
  hospitalId: string,
  {
    email,
    password,
    role = 'ADMIN',
    isActive = true,
  }: {
    email: string;
    password: string;
    role?: Role;
    isActive?: boolean;
  },
) {
  return prisma.user.create({
    data: {
      hospitalId,
      email,
      role,
      isActive,
      fullName: 'Test User',
      passwordHash: await hashPassword(password),
    },
  });
}
