import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
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

async function desk(role: 'RECEPTIONIST' | 'NURSE' = 'RECEPTIONIST') {
  const { id } = await createHospital();
  hospitalIds.push(id);
  const user = await createUser(id, {
    email: `r-${crypto.randomUUID()}@nabd.test`,
    password: 'x',
    role,
  });
  const auth = {
    Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
  };
  return {
    id,
    register: (body: object) =>
      request(app)
        .post('/api/reception/patients')
        .set(auth)
        .send({ gender: 'FEMALE', ...body }),
    search: (search: string) =>
      request(app).get('/api/reception/patients').query({ search }).set(auth),
    arrival: (body: object) => request(app).post('/api/reception/er-arrivals').set(auth).send(body),
    identify: (patientId: string, body: object) =>
      request(app).post(`/api/reception/patients/${patientId}/identify`).set(auth).send(body),
    unidentified: () =>
      request(app).get('/api/reception/patients').query({ anonymous: 'true' }).set(auth),
    openAccount: (patientId: string, body: object) =>
      request(app).post(`/api/reception/patients/${patientId}/account`).set(auth).send(body),
  };
}

const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('reception registers patients (task 4.1)', () => {
  it('registers a patient with their file, and an account they can sign in with', async () => {
    const r = await desk();
    const res = await r.register({
      fullName: 'سارة الأحمد',
      phone: '0991 234 567',
      nationalId: '01020304050',
      dateOfBirth: '1990-05-01',
      bloodType: 'A+',
      allergies: 'البنسلين',
      chronicConditions: 'ربو',
      account: { email: 'Sara@Mail.com', password: 'Strong#Pass1' },
    });
    expect(res.status).toBe(201);
    expect(res.body.patient).toMatchObject({
      fullName: 'سارة الأحمد',
      nationalId: '01020304050',
      accountEmail: 'sara@mail.com',
    });
    const patient = await prisma.patient.findUniqueOrThrow({
      where: { id: res.body.patient.patientId },
      include: { medicalRecord: true, user: true },
    });
    expect(patient).toMatchObject({ bloodType: 'A+', hospitalId: r.id });
    expect(patient.medicalRecord).toMatchObject({
      allergies: 'البنسلين',
      chronicConditions: 'ربو',
    });
    expect(patient.user).toMatchObject({ role: 'PATIENT', fullName: 'سارة الأحمد' });

    // The patient signs in with what reception handed over.
    expect((await login('sara@mail.com', 'Strong#Pass1')).status).toBe(200);
    // Found by name, phone or national number.
    for (const term of ['سارة', '234', '0102']) {
      expect(
        (await r.search(term)).body.patients.map((p: { fullName: string }) => p.fullName),
      ).toEqual(['سارة الأحمد']);
    }
  });

  it('a national number already here points to that patient instead of a duplicate', async () => {
    const r = await desk();
    const first = (await r.register({ fullName: 'عمر', nationalId: '11223344' })).body.patient;
    const again = await r.register({ fullName: 'عمر يوسف', nationalId: '11223344' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'PATIENT_EXISTS',
      details: { patientId: first.patientId, fullName: 'عمر' },
    });
    expect(await prisma.patient.count({ where: { hospitalId: r.id } })).toBe(1);
  });

  it('opens an account later; refuses a taken email or a second account', async () => {
    const r = await desk();
    const taken = await r.register({
      fullName: 'ليلى',
      account: { email: 'taken@mail.com', password: 'Strong#Pass1' },
    });
    expect(taken.status).toBe(201);
    const walkIn = (await r.register({ fullName: 'منى' })).body.patient;
    expect(walkIn.accountEmail).toBeNull();

    expect(
      (await r.openAccount(walkIn.patientId, { email: 'taken@mail.com', password: 'Strong#Pass1' }))
        .body.error.code,
    ).toBe('EMAIL_TAKEN');
    // Nothing half-made when the email is taken at registration.
    expect(
      (
        await r.register({
          fullName: 'نور',
          account: { email: 'TAKEN@mail.com', password: 'Strong#Pass1' },
        })
      ).body.error.code,
    ).toBe('EMAIL_TAKEN');
    expect(await prisma.patient.count({ where: { hospitalId: r.id, fullName: 'نور' } })).toBe(0);

    const opened = await r.openAccount(walkIn.patientId, {
      email: 'mona@mail.com',
      password: 'Strong#Pass1',
    });
    expect(opened.status).toBe(201);
    expect(opened.body.patient.accountEmail).toBe('mona@mail.com');
    expect(
      (await r.openAccount(walkIn.patientId, { email: 'other@mail.com', password: 'Strong#Pass1' }))
        .body.error.code,
    ).toBe('HAS_ACCOUNT');
  });

  it('only reception and the admin; a weak password is refused', async () => {
    const nurse = await desk('NURSE');
    expect((await nurse.register({ fullName: 'x' })).status).toBe(403);
    const r = await desk();
    expect(
      (await r.register({ fullName: 'x', account: { email: 'a@b.co', password: '123' } })).status,
    ).toBe(400);
  });
});

describe('reception at the emergency desk (task 4.3)', () => {
  it('registers an arrival onto the ER list, and names the unidentified one later', async () => {
    const r = await desk();
    // No emergency room yet: nowhere to send them.
    expect(
      (
        await r.arrival({
          anonymous: true,
          gender: 'MALE',
          chiefComplaint: 'حادث سير',
          arrivalNote: null,
        })
      ).status,
    ).toBe(409);
    await prisma.department.create({
      data: { hospitalId: r.id, name: 'الإسعاف', code: 'EMERGENCY' },
    });
    const res = await r.arrival({
      anonymous: true,
      gender: 'MALE',
      chiefComplaint: 'حادث سير',
      arrivalNote: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.visit).toMatchObject({ isAnonymous: true, status: 'WAITING' });
    const visit = await prisma.triageAssessment.findUniqueOrThrow({
      where: { id: res.body.visit.id },
    });
    expect(visit.nurseId).toBeNull();

    const unknown = (await r.unidentified()).body.patients;
    expect(unknown.map((p: { patientId: string }) => p.patientId)).toEqual([
      res.body.visit.patientId,
    ]);

    const named = await r.identify(res.body.visit.patientId, {
      fullName: 'مازن العلي',
      gender: 'MALE',
      nationalId: '99887766',
      phone: '0933 000 111',
    });
    expect(named.body).toMatchObject({
      merged: false,
      patient: { fullName: 'مازن العلي', isAnonymous: false, nationalId: '99887766' },
    });
    expect((await r.unidentified()).body.patients).toEqual([]);
    // Once named, not again; and now an account can be opened.
    expect(
      (await r.identify(res.body.visit.patientId, { fullName: 'x', gender: 'MALE' })).status,
    ).toBe(409);
    expect(
      (
        await r.openAccount(res.body.visit.patientId, {
          email: `m-${crypto.randomUUID()}@mail.com`,
          password: 'Strong#Pass1',
        })
      ).status,
    ).toBe(201);
  });

  it('joins an unidentified file to the patient they turn out to be', async () => {
    const r = await desk();
    await prisma.department.create({
      data: { hospitalId: r.id, name: 'الإسعاف', code: 'EMERGENCY' },
    });
    const known = (
      await r.register({
        fullName: 'سارة الأحمد',
        nationalId: '11112222',
        allergies: 'البنسلين',
        account: { email: `s-${crypto.randomUUID()}@mail.com`, password: 'Strong#Pass1' },
      })
    ).body.patient;
    const arrival = (
      await r.arrival({
        anonymous: true,
        gender: 'FEMALE',
        chiefComplaint: 'غياب وعي',
        arrivalNote: null,
      })
    ).body.visit;
    const unknownRecord = await prisma.medicalRecord.findUniqueOrThrow({
      where: { patientId: arrival.patientId },
    });
    await prisma.medicalRecord.update({
      where: { id: unknownRecord.id },
      data: { allergies: 'اليود' },
    });
    const doctor = await createUser(r.id, {
      email: `d-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'DOCTOR',
    });
    await prisma.doctorReport.create({
      data: {
        hospitalId: r.id,
        recordId: unknownRecord.id,
        doctorId: doctor.id,
        doctorName: 'د. رامي',
        title: 'إسعاف',
        diagnosis: 'ارتجاج',
        content: 'مراقبة',
      },
    });

    const res = await r.identify(arrival.patientId, {
      fullName: 'سارة',
      gender: 'FEMALE',
      nationalId: '11112222',
      phone: '0944 555 666',
    });
    expect(res.body).toMatchObject({
      merged: true,
      patient: { patientId: known.patientId, fullName: 'سارة الأحمد', phone: '0944 555 666' },
    });
    expect(await prisma.patient.findUnique({ where: { id: arrival.patientId } })).toBeNull();
    expect(
      (await prisma.triageAssessment.findUniqueOrThrow({ where: { id: arrival.id } })).patientId,
    ).toBe(known.patientId);
    const record = await prisma.medicalRecord.findUniqueOrThrow({
      where: { patientId: known.patientId },
      include: { reports: true },
    });
    expect(record.allergies).toBe('البنسلين\nاليود');
    expect(record.reports.map((report) => report.diagnosis)).toEqual(['ارتجاج']);
  });

  it('keeps the emergency desk to reception', async () => {
    const r = await desk('NURSE');
    expect(
      (await r.arrival({ anonymous: true, gender: null, chiefComplaint: 'ألم', arrivalNote: null }))
        .status,
    ).toBe(403);
  });
});
