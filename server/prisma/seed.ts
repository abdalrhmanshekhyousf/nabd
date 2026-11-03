// Seeds a demo hospital with one account per role, so every dashboard can be
// tried right away. Safe to run more than once: existing records are reused.
// Later phases extend this file with departments, patients and activity.
import type { Role } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const DEMO_HOSPITAL = {
  name: 'مستشفى نبض التجريبي',
  address: 'دمشق، سوريا',
  phone: '+963 11 000 0000',
  email: 'info@nabd.demo',
};

// One password for every demo account.
const PASSWORD = process.env.SEED_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

const DEMO_USERS: { role: Role; email: string; fullName: string }[] = [
  { role: 'ADMIN', email: 'admin@nabd.demo', fullName: 'مدير المستشفى' },
  { role: 'DOCTOR', email: 'doctor@nabd.demo', fullName: 'د. سامر الحلبي' },
  { role: 'NURSE', email: 'nurse@nabd.demo', fullName: 'لينا خوري' },
  { role: 'PHARMACIST', email: 'pharmacist@nabd.demo', fullName: 'رامي العطار' },
  { role: 'LAB_TECHNICIAN', email: 'lab@nabd.demo', fullName: 'هبة الشامي' },
  { role: 'RADIOLOGIST', email: 'radiology@nabd.demo', fullName: 'كريم داوود' },
  { role: 'CLEANER', email: 'cleaner@nabd.demo', fullName: 'أبو محمد' },
  { role: 'RECEPTIONIST', email: 'reception@nabd.demo', fullName: 'نور الأحمد' },
  { role: 'ACCOUNTANT', email: 'accountant@nabd.demo', fullName: 'وسيم قاسم' },
  { role: 'PATIENT', email: 'patient@nabd.demo', fullName: 'أحمد يوسف' },
];

async function main() {
  const hospital =
    (await prisma.hospital.findFirst({ where: { name: DEMO_HOSPITAL.name } })) ??
    (await prisma.hospital.create({ data: DEMO_HOSPITAL }));
  const hospitalId = hospital.id;
  const passwordHash = await hashPassword(PASSWORD);

  for (const { role, email, fullName } of DEMO_USERS) {
    const exists = await prisma.user.findUnique({
      where: { hospitalId_email: { hospitalId, email } },
    });
    if (exists) continue;

    await prisma.user.create({
      data: {
        hospitalId,
        role,
        email,
        fullName,
        passwordHash,
        // Staff get an employment profile; doctors and patients their own records.
        ...(role !== 'PATIENT' && {
          staffProfile: {
            create: {
              hospitalId,
              ...(role === 'RADIOLOGIST' && { radiologyModality: 'XRAY' as const }),
            },
          },
        }),
        ...(role === 'DOCTOR' && {
          doctorProfile: { create: { hospitalId, specialty: 'Cardiology' } },
        }),
        ...(role === 'PATIENT' && {
          patient: {
            create: { hospitalId, fullName, medicalRecord: { create: { hospitalId } } },
          },
        }),
      },
    });
  }

  console.info(`Hospital: ${hospital.name} (${hospital.id})`);
  console.info(`Demo accounts (password ${PASSWORD}):`);
  for (const { role, email } of DEMO_USERS) console.info(`  ${role.padEnd(15)} ${email}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
