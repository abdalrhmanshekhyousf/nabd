import { PRESCRIPTION_STATUSES } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { PrescriptionStatus } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** A hospital with a doctor and a patient whose record is ready. */
async function withPatient() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const doctor = await createUser(id, {
    email: `doctor-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role: 'DOCTOR',
  });
  await prisma.user.update({ where: { id: doctor.id }, data: { fullName: 'د. ريم العلي' } });
  const db = forHospital(id);
  const patient = await db.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة الأحمد',
      medicalRecord: { create: { hospitalId: id, doctorId: doctor.id, allergies: 'البنسلين' } },
    },
    include: { medicalRecord: true },
  });
  return { id, db, doctor, patient, record: patient.medicalRecord! };
}

describe('medical file tables', () => {
  it('a patient who signs up gets an empty record', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);

    const res = await request(app)
      .post('/api/auth/register/patient')
      .send({
        hospitalId: id,
        fullName: 'سارة',
        phone: '0991234567',
        gender: 'FEMALE',
        dateOfBirth: null,
        email: `sara-${crypto.randomUUID()}@mail.test`,
        password: 'Strong1234',
      });

    expect(res.status).toBe(201);
    const record = await prisma.medicalRecord.findFirst({
      where: { patient: { user: { id: res.body.user.id } } },
    });
    expect(record).toMatchObject({ hospitalId: id, doctorId: null, allergies: null });
  });

  it('keeps reports and prescriptions with their medicines, inside the hospital', async () => {
    const { id, db, doctor, record } = await withPatient();

    await db.doctorReport.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorId: doctor.id,
        doctorName: 'د. ريم العلي',
        title: 'مراجعة أولى',
        diagnosis: 'ارتفاع ضغط',
        content: 'المريضة بحالة مستقرة.',
      },
    });
    const prescription = await db.prescription.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorId: doctor.id,
        doctorName: 'د. ريم العلي',
        items: {
          create: [
            { hospitalId: id, drugName: 'أملوديبين', dose: '5 ملغ', frequency: 'مرة باليوم' },
            {
              hospitalId: id,
              drugName: 'باراسيتامول',
              dose: '500 ملغ',
              frequency: 'كل 8 ساعات',
              durationDays: 5,
            },
          ],
        },
      },
      include: { items: true },
    });

    expect(prescription).toMatchObject({ status: 'PENDING', dispensedAt: null });
    expect(prescription.items.map((item) => item.drugName).sort()).toEqual(
      ['أملوديبين', 'باراسيتامول'].sort(),
    );
    const file = await db.medicalRecord.findUnique({
      where: { id: record.id },
      include: { reports: true, prescriptions: { include: { items: true } } },
    });
    expect(file?.reports).toHaveLength(1);
    expect(file?.prescriptions[0].items).toHaveLength(2);
  });

  it('another hospital sees none of it', async () => {
    const { record } = await withPatient();
    const other = await createHospital();
    hospitalIds.push(other.id);
    const theirs = forHospital(other.id);

    expect(await theirs.medicalRecord.findUnique({ where: { id: record.id } })).toBeNull();
    expect(await theirs.doctorReport.count({ where: { recordId: record.id } })).toBe(0);
    expect(await theirs.prescription.count({ where: { recordId: record.id } })).toBe(0);
  });

  it('allows one record per patient', async () => {
    const { id, db, patient } = await withPatient();

    await expect(
      db.medicalRecord.create({ data: { hospitalId: id, patientId: patient.id } }),
    ).rejects.toThrow();
  });

  it('removing a doctor keeps their reports and prescriptions, signed with their name', async () => {
    const { id, db, doctor, record } = await withPatient();
    await db.doctorReport.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorId: doctor.id,
        doctorName: 'د. ريم العلي',
        title: 'تقرير',
        content: 'نص',
      },
    });
    await db.prescription.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorId: doctor.id,
        doctorName: 'د. ريم العلي',
      },
    });

    await prisma.user.delete({ where: { id: doctor.id } });

    expect(await db.doctorReport.findFirst({ where: { recordId: record.id } })).toMatchObject({
      doctorId: null,
      doctorName: 'د. ريم العلي',
    });
    expect(await db.prescription.count({ where: { recordId: record.id } })).toBe(1);
    expect((await db.medicalRecord.findUnique({ where: { id: record.id } }))?.doctorId).toBeNull();
  });

  it('removing a patient removes their whole file', async () => {
    const { id, db, doctor, patient, record } = await withPatient();
    await db.prescription.create({
      data: {
        hospitalId: id,
        recordId: record.id,
        doctorId: doctor.id,
        doctorName: 'د. ريم العلي',
        items: { create: [{ hospitalId: id, drugName: 'x', dose: 'y', frequency: 'z' }] },
      },
    });

    await db.patient.delete({ where: { id: patient.id } });

    expect(await prisma.medicalRecord.count({ where: { id: record.id } })).toBe(0);
    expect(await prisma.prescriptionItem.count({ where: { hospitalId: id } })).toBe(0);
  });

  it('the shared prescription statuses match the database enum', () => {
    expect([...PRESCRIPTION_STATUSES].sort()).toEqual(Object.values(PrescriptionStatus).sort());
  });
});

describe('doctor status time', () => {
  it('records when the status last changed', async () => {
    const { id, doctor } = await withPatient();
    await prisma.doctorProfile.create({
      data: {
        hospitalId: id,
        userId: doctor.id,
        specialty: 'قلبية',
        statusChangedAt: new Date('2026-01-01'),
      },
    });
    const token = signAccessToken({ sub: doctor.id, hospitalId: id, role: 'DOCTOR' });

    await request(app)
      .patch('/api/doctors/me/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'BUSY' });

    const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctor.id } });
    expect(Date.now() - profile!.statusChangedAt.getTime()).toBeLessThan(10_000);
  });
});
