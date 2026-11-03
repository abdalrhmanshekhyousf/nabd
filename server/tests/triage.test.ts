import { CONSCIOUSNESS_LEVELS, DOCTOR_CALL_STATUSES, TRIAGE_STATUSES } from '@nabd/shared';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Consciousness, DoctorCallStatus, TriageStatus } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { createHospital, createUser } from './helpers.js';

const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** A hospital with an ER nurse, a doctor and an unidentified arrival. */
async function erArrival() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const [nurse, doctor] = await Promise.all(
    (['NURSE', 'DOCTOR'] as const).map((role) =>
      createUser(id, { email: `${role}-${crypto.randomUUID()}@nabd.test`, password: 'x', role }),
    ),
  );
  const db = forHospital(id);
  const patient = await db.patient.create({
    data: { hospitalId: id, isAnonymous: true, medicalRecord: { create: { hospitalId: id } } },
  });
  const visit = await db.triageAssessment.create({
    data: { hospitalId: id, patientId: patient.id, nurseId: nurse.id },
  });
  return { id, db, nurse, doctor, patient, visit };
}

describe('emergency room tables', () => {
  it('a visit starts waiting and unassessed, then takes the triage details', async () => {
    const { db, visit } = await erArrival();
    expect(visit).toMatchObject({ status: 'WAITING', level: null, pulse: null, assessedAt: null });

    const assessed = await db.triageAssessment.update({
      where: { id: visit.id },
      data: {
        chiefComplaint: 'ألم بالصدر',
        pulse: 118,
        systolic: 90,
        diastolic: 60,
        respiratoryRate: 24,
        oxygenSaturation: 91,
        temperature: 37.8,
        consciousness: 'ALERT',
        breathing: true,
        painScore: 8,
        expectedExams: 2,
        suggestedLevel: 2,
        level: 2,
        assessedAt: new Date(),
      },
    });

    expect(assessed).toMatchObject({ level: 2, painScore: 8, consciousness: 'ALERT' });
    expect(Number(assessed.temperature)).toBe(37.8);
  });

  it('the database refuses values that cannot be real', async () => {
    const { db, visit } = await erArrival();
    for (const data of [
      { level: 6 },
      { suggestedLevel: 0 },
      { painScore: 11 },
      { oxygenSaturation: 120 },
      { temperature: 60 },
    ]) {
      await expect(db.triageAssessment.update({ where: { id: visit.id }, data })).rejects.toThrow();
    }
  });

  it('the waiting list orders by level, then by who came first', async () => {
    const { id, db, patient } = await erArrival();
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    await db.triageAssessment.deleteMany({});
    await db.triageAssessment.createMany({
      data: [
        {
          hospitalId: id,
          patientId: patient.id,
          level: 3,
          arrivedAt: minutesAgo(30),
          chiefComplaint: 'c',
        },
        {
          hospitalId: id,
          patientId: patient.id,
          level: 1,
          arrivedAt: minutesAgo(5),
          chiefComplaint: 'a',
        },
        {
          hospitalId: id,
          patientId: patient.id,
          level: 3,
          arrivedAt: minutesAgo(40),
          chiefComplaint: 'b',
        },
        {
          hospitalId: id,
          patientId: patient.id,
          level: 2,
          arrivedAt: minutesAgo(1),
          chiefComplaint: 'd',
          status: 'DISCHARGED',
        },
      ],
    });

    const queue = await db.triageAssessment.findMany({
      where: { status: { in: ['WAITING', 'IN_TREATMENT'] } },
      orderBy: [{ level: 'asc' }, { arrivedAt: 'asc' }],
    });

    expect(queue.map((visit) => visit.chiefComplaint)).toEqual(['a', 'b', 'c']);
  });

  it('records a call to a doctor and the answer', async () => {
    const { id, db, nurse, doctor, visit } = await erArrival();

    const call = await db.doctorCall.create({
      data: { hospitalId: id, triageId: visit.id, doctorId: doctor.id, calledById: nurse.id },
    });
    expect(call).toMatchObject({ status: 'PENDING', respondedAt: null });

    const answered = await db.doctorCall.update({
      where: { id: call.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    expect(answered.status).toBe('ACCEPTED');
  });

  it('another hospital sees none of it', async () => {
    const { visit } = await erArrival();
    const other = await createHospital();
    hospitalIds.push(other.id);

    expect(
      await forHospital(other.id).triageAssessment.findUnique({ where: { id: visit.id } }),
    ).toBeNull();
  });

  it('removing a doctor keeps the call history; removing the patient removes the visit', async () => {
    const { id, db, nurse, doctor, patient, visit } = await erArrival();
    const call = await db.doctorCall.create({
      data: { hospitalId: id, triageId: visit.id, doctorId: doctor.id, calledById: nurse.id },
    });

    await prisma.user.delete({ where: { id: doctor.id } });
    expect((await db.doctorCall.findUnique({ where: { id: call.id } }))?.doctorId).toBeNull();

    await db.patient.delete({ where: { id: patient.id } });
    expect(await prisma.triageAssessment.count({ where: { id: visit.id } })).toBe(0);
    expect(await prisma.doctorCall.count({ where: { id: call.id } })).toBe(0);
  });

  it('the shared lists match the database enums', () => {
    expect([...CONSCIOUSNESS_LEVELS].sort()).toEqual(Object.values(Consciousness).sort());
    expect([...TRIAGE_STATUSES].sort()).toEqual(Object.values(TriageStatus).sort());
    expect([...DOCTOR_CALL_STATUSES].sort()).toEqual(Object.values(DoctorCallStatus).sort());
  });
});
