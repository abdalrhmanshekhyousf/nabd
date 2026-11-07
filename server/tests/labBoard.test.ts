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

type Role = 'DOCTOR' | 'LAB_TECHNICIAN' | 'NURSE' | 'PATIENT';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function lab() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: Role, fullName: string) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      auth,
      board: () => request(app).get('/api/lab-tests').set(auth),
      start: (testId: string) => request(app).post(`/api/lab-tests/${testId}/start`).set(auth),
      result: (testId: string, fields: Record<string, string>, file?: Buffer) => {
        const req = request(app).post(`/api/lab-tests/${testId}/result`).set(auth);
        for (const [key, value] of Object.entries(fields)) req.field(key, value);
        if (file) req.attach('file', file, 'result.pdf');
        return req;
      },
      file: (testId: string) => request(app).get(`/api/lab-tests/${testId}/file`).set(auth),
    };
  }
  const doctor = await person('DOCTOR', 'د. سامي');
  const patientUser = await person('PATIENT', 'سارة');
  const patient = await prisma.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة',
      userId: patientUser.id,
      medicalRecord: { create: { hospitalId: id, doctorId: doctor.id } },
    },
    include: { medicalRecord: true },
  });
  const order = (code: string, priority: 'ROUTINE' | 'URGENT' = 'ROUTINE') =>
    prisma.labTest.create({
      data: {
        hospitalId: id,
        recordId: patient.medicalRecord!.id,
        code,
        priority,
        doctorId: doctor.id,
        doctorName: 'د. سامي',
      },
    });
  return { id, person, doctor, patientUser, patient, order };
}

describe('lab board (task 3.5)', () => {
  it('lists waiting tests urgent first, with whose they are', async () => {
    const h = await lab();
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    await h.order('CBC');
    await h.order('TROPONIN', 'URGENT');

    const tests = (await heba.board()).body.tests;

    expect(tests.map((t: { code: string }) => t.code)).toEqual(['TROPONIN', 'CBC']);
    expect(tests[0]).toMatchObject({
      status: 'REQUESTED',
      doctorName: 'د. سامي',
      patient: { fullName: 'سارة', isAnonymous: false },
      mine: false,
    });
    expect((await h.doctor.board()).status).toBe(403);
  });

  it('two technicians taking the same test at once: one gets it, the other is told who', async () => {
    const h = await lab();
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    const omar = await h.person('LAB_TECHNICIAN', 'عمر');
    const test = await h.order('CBC');

    const results = await Promise.all([heba.start(test.id), omar.start(test.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const late = results.find((r) => r.status === 409)!;
    expect(late.body.error.code).toBe('ALREADY_TAKEN');
    const winner = results.find((r) => r.status === 200)!.body.test;
    expect(winner).toMatchObject({ status: 'IN_PROGRESS', mine: true });
    // Only the one on it records its result.
    const other = winner.technicianName === 'هبة' ? omar : heba;
    expect((await other.result(test.id, { result: 'Hb 12', abnormal: 'false' })).status).toBe(403);
  });

  it('the result goes into the file; the doctor and the patient are told', async () => {
    const h = await lab();
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    const test = await h.order('FBS');
    await heba.start(test.id);

    const res = await heba.result(test.id, { result: 'سكر صيامي: 182 ملغ/دل', abnormal: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({
      status: 'DONE',
      result: 'سكر صيامي: 182 ملغ/دل',
      abnormal: true,
      hasResultFile: false,
      technicianName: 'هبة',
    });
    const fileView = (
      await request(app).get(`/api/doctors/me/patients/${h.patient.id}`).set(h.doctor.auth)
    ).body.labTests[0];
    expect(fileView).toMatchObject({ status: 'DONE', result: 'سكر صيامي: 182 ملغ/دل' });
    const notices = await prisma.notification.findMany({
      where: { hospitalId: h.id, type: 'LAB_RESULT' },
      orderBy: { userId: 'asc' },
    });
    expect(notices.map((n) => [n.userId, n.link, n.data])).toEqual(
      expect.arrayContaining([
        [h.doctor.id, `/doctor/patients/${h.patient.id}`, { code: 'FBS', patient: 'سارة' }],
        [h.patientUser.id, '/patient/file', { code: 'FBS', patient: 'سارة' }],
      ]),
    );
    // Done is done.
    expect((await heba.result(test.id, { result: 'x', abnormal: 'false' })).status).toBe(409);
  });

  it('a PDF result is kept and shown only to the lab, the doctor and the patient', async () => {
    const h = await lab();
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    const nurse = await h.person('NURSE', 'لينا');
    const otherDoctor = await h.person('DOCTOR', 'د. نور');
    const test = await h.order('CBC');

    const res = await heba.result(test.id, { abnormal: 'false' }, PDF);
    expect(res.body.test).toMatchObject({ status: 'DONE', hasResultFile: true, result: null });

    for (const viewer of [h.doctor, h.patientUser, heba]) {
      const file = await viewer.file(test.id);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toMatch(/application\/pdf/);
    }
    expect((await otherDoctor.file(test.id)).status).toBe(404);
    expect((await nurse.file(test.id)).status).toBe(404);
  });

  it('needs the values or a file, and refuses a file that is not a PDF or an image', async () => {
    const h = await lab();
    const heba = await h.person('LAB_TECHNICIAN', 'هبة');
    const test = await h.order('CBC');

    expect((await heba.result(test.id, { abnormal: 'false' })).status).toBe(400);
    const fake = await heba.result(
      test.id,
      { abnormal: 'false' },
      Buffer.from('<script>x</script>'),
    );
    expect(fake.status).toBe(415);
    expect((await prisma.labTest.findUniqueOrThrow({ where: { id: test.id } })).status).toBe(
      'REQUESTED',
    );
  });
});
