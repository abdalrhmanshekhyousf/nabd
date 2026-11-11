// The demo hospital with one account per role, so every dashboard can be tried
// right away (run by seed.ts, and by its test). Safe to run more than once:
// existing records are reused. Phase 2 adds the teams and a lively ER and
// operating rooms (seedPhaseTwo.ts).
import type { Role } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { seedInventory } from './seedInventory.js';
import { seedWards } from './seedWards.js';
import { seedPhaseThree } from './seedPhaseThree.js';
import { seedPhaseTwo } from './seedPhaseTwo.js';

export const DEMO_HOSPITAL = {
  name: 'مستشفى نبض التجريبي',
  address: 'دمشق، سوريا',
  phone: '+963 11 000 0000',
  email: 'info@nabd.demo',
};

// One password for every demo account.
export const PASSWORD =
  process.env.SEED_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

export const DEMO_USERS: { role: Role; email: string; fullName: string }[] = [
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

/**
 * The demo patient is the demo doctor's patient, with a short history (task
 * 2.7). Only once: a file that already has a doctor is left alone.
 */
async function seedMedicalFile(hospitalId: string) {
  const doctor = await prisma.user.findUnique({
    where: { hospitalId_email: { hospitalId, email: 'doctor@nabd.demo' } },
  });
  const record = await prisma.medicalRecord.findFirst({
    where: { hospitalId, patient: { user: { email: 'patient@nabd.demo' } } },
  });
  if (!doctor || !record || record.doctorId) return;

  await prisma.medicalRecord.update({
    where: { id: record.id },
    data: { doctorId: doctor.id, allergies: 'البنسلين', chronicConditions: 'ارتفاع ضغط الدم' },
  });
  await prisma.patient.update({
    where: { id: record.patientId },
    data: { gender: 'MALE', dateOfBirth: new Date('1968-03-12'), bloodType: 'A+' },
  });
  const signed = {
    hospitalId,
    recordId: record.id,
    doctorId: doctor.id,
    doctorName: doctor.fullName,
  };
  await prisma.doctorReport.create({
    data: {
      ...signed,
      title: 'زيارة أولى',
      diagnosis: 'ارتفاع ضغط الدم',
      content: 'الضغط 150/95. بلشنا بدواء خافض للضغط، والمراجعة بعد أسبوعين.',
      createdAt: new Date(Date.now() - 14 * 86_400_000),
    },
  });
  await prisma.doctorReport.create({
    data: {
      ...signed,
      title: 'مراجعة',
      diagnosis: 'ارتفاع ضغط الدم، تحت السيطرة',
      content: 'الضغط صار 130/85 مع الدواء. منكمّل على نفس الجرعة.',
    },
  });
  await prisma.prescription.create({
    data: {
      ...signed,
      notes: 'بعد الأكل',
      items: {
        create: [
          {
            hospitalId,
            drugName: 'أملوديبين',
            dose: '5 ملغ',
            frequency: 'مرة باليوم',
            durationDays: 30,
          },
          { hospitalId, drugName: 'أسبرين', dose: '81 ملغ', frequency: 'مرة باليوم' },
        ],
      },
    },
  });
}

/** The demo nurse works in the emergency room, so ER pages can be tried (task 2.11). */
async function seedEmergencyNurse(hospitalId: string) {
  const er =
    (await prisma.department.findFirst({ where: { hospitalId, code: 'EMERGENCY' } })) ??
    (await prisma.department.create({ data: { hospitalId, name: 'الإسعاف', code: 'EMERGENCY' } }));
  await prisma.staffProfile.updateMany({
    where: { hospitalId, departmentId: null, user: { email: 'nurse@nabd.demo' } },
    data: { departmentId: er.id },
  });
}

/** Creates or completes the demo hospital; a test passes its own hospital details. */
export async function seedDemo(
  details: typeof DEMO_HOSPITAL = DEMO_HOSPITAL,
  { sampleStock = false } = {},
) {
  const hospital =
    (await prisma.hospital.findFirst({ where: { name: details.name } })) ??
    (await prisma.hospital.create({ data: details }));
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
          doctorProfile: { create: { hospitalId, specialty: 'قلبية' } },
        }),
        ...(role === 'PATIENT' && {
          patient: {
            create: { hospitalId, fullName, medicalRecord: { create: { hospitalId } } },
          },
        }),
      },
    });
  }

  await seedEmergencyNurse(hospitalId);
  await seedMedicalFile(hospitalId);
  const activity = await seedPhaseTwo(hospitalId, passwordHash);
  const wards = await seedWards(hospitalId);
  const stock = await seedInventory(hospitalId, { sample: sampleStock });
  // Needs the wards, the stock and the teams above (task 3.28).
  const care = await seedPhaseThree(hospitalId);
  return { hospital, activity, wards, stock, care };
}
