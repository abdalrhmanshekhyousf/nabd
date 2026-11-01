// Seeds a demo hospital and its admin so the app can be logged into right away.
// Safe to run more than once: existing records are reused, not duplicated.
// Later phases extend this file with demo staff, patients and activity.
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const DEMO_HOSPITAL = {
  name: 'مستشفى نبض التجريبي',
  address: 'دمشق، سوريا',
  phone: '+963 11 000 0000',
  email: 'info@nabd.demo',
};

const DEMO_ADMIN = {
  email: 'admin@nabd.demo',
  fullName: 'مدير المستشفى',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
};

async function main() {
  const hospital =
    (await prisma.hospital.findFirst({ where: { name: DEMO_HOSPITAL.name } })) ??
    (await prisma.hospital.create({ data: DEMO_HOSPITAL }));

  const admin = await prisma.user.upsert({
    where: { hospitalId_email: { hospitalId: hospital.id, email: DEMO_ADMIN.email } },
    update: {},
    create: {
      hospitalId: hospital.id,
      role: 'ADMIN',
      email: DEMO_ADMIN.email,
      fullName: DEMO_ADMIN.fullName,
      passwordHash: await hashPassword(DEMO_ADMIN.password),
      staffProfile: { create: { hospitalId: hospital.id } },
    },
  });

  console.info(`Hospital: ${hospital.name} (${hospital.id})`);
  console.info(`Admin:    ${admin.email} / ${DEMO_ADMIN.password}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
