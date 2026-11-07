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

// The first bytes are what the server checks: a PNG and a JPEG signature.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

type Role = 'DOCTOR' | 'RADIOLOGIST' | 'PATIENT' | 'NURSE';

async function radiology() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(role: Role, fullName: string, modality?: 'CT' | 'XRAY') {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (modality) {
      await prisma.staffProfile.create({
        data: { hospitalId: id, userId: user.id, radiologyModality: modality },
      });
    }
    const auth = {
      Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: id, role })}`,
    };
    return {
      ...user,
      auth,
      start: (studyId: string) => request(app).post(`/api/imaging/${studyId}/start`).set(auth),
      report: (studyId: string, fields: Record<string, string>, images: Buffer[] = []) => {
        const req = request(app).post(`/api/imaging/${studyId}/report`).set(auth);
        for (const [key, value] of Object.entries(fields)) req.field(key, value);
        images.forEach((image, i) => req.attach('images', image, `image-${i}.png`));
        return req;
      },
      image: (studyId: string, index: number) =>
        request(app).get(`/api/imaging/${studyId}/images/${index}`).set(auth),
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
  const order = (modality: 'CT' | 'XRAY', bodyPart: string) =>
    prisma.radiologyImage.create({
      data: {
        hospitalId: id,
        recordId: patient.medicalRecord!.id,
        modality,
        bodyPart,
        doctorId: doctor.id,
        doctorName: 'د. سامي',
      },
    });
  return { id, person, doctor, patientUser, patient, order };
}

describe('radiology report with images (task 3.8)', () => {
  it('the report and its images go into the file; the doctor and the patient are told', async () => {
    const h = await radiology();
    const karim = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const study = await h.order('CT', 'رأس');
    await karim.start(study.id);

    const res = await karim.report(
      study.id,
      { report: 'لا يوجد نزف داخل القحف. لا كسور.', abnormal: 'false' },
      [PNG, JPEG],
    );

    expect(res.status).toBe(200);
    expect(res.body.study).toMatchObject({
      status: 'DONE',
      report: 'لا يوجد نزف داخل القحف. لا كسور.',
      abnormal: false,
      imageCount: 2,
      radiologistName: 'كريم',
    });
    const file = (
      await request(app).get(`/api/doctors/me/patients/${h.patient.id}`).set(h.doctor.auth)
    ).body.imaging[0];
    expect(file).toMatchObject({ status: 'DONE', imageCount: 2 });
    const notices = await prisma.notification.findMany({
      where: { hospitalId: h.id, type: 'IMAGING_RESULT' },
    });
    expect(notices.map((n) => [n.userId, n.link, n.data])).toEqual(
      expect.arrayContaining([
        [
          h.doctor.id,
          `/doctor/patients/${h.patient.id}`,
          { modality: 'CT', part: 'رأس', patient: 'سارة' },
        ],
        [h.patientUser.id, '/patient/file', { modality: 'CT', part: 'رأس', patient: 'سارة' }],
      ]),
    );
  });

  it('each image is served only to radiology, the patient’s doctor and the patient', async () => {
    const h = await radiology();
    const karim = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const nurse = await h.person('NURSE', 'لينا');
    const otherDoctor = await h.person('DOCTOR', 'د. نور');
    const study = await h.order('CT', 'صدر');
    await karim.report(study.id, { report: 'سليم', abnormal: 'false' }, [PNG, JPEG]);

    for (const viewer of [h.doctor, h.patientUser, karim]) {
      const second = await viewer.image(study.id, 1);
      expect(second.status).toBe(200);
      expect(second.headers['content-type']).toMatch(/image\/jpeg/);
    }
    expect((await h.doctor.image(study.id, 0)).headers['content-type']).toMatch(/image\/png/);
    expect((await h.doctor.image(study.id, 2)).status).toBe(404);
    expect((await otherDoctor.image(study.id, 0)).status).toBe(404);
    expect((await nurse.image(study.id, 0)).status).toBe(404);
  });

  it('needs a report and an image, refuses fake files, and is for that type’s radiologists', async () => {
    const h = await radiology();
    const karim = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const omar = await h.person('RADIOLOGIST', 'عمر', 'CT');
    const xray = await h.person('RADIOLOGIST', 'هالة', 'XRAY');
    const study = await h.order('CT', 'بطن');

    expect((await karim.report(study.id, { report: '', abnormal: 'false' }, [PNG])).status).toBe(
      400,
    );
    expect((await karim.report(study.id, { report: 'سليم', abnormal: 'false' })).status).toBe(400);
    const fake = await karim.report(study.id, { report: 'سليم', abnormal: 'false' }, [
      Buffer.from('<svg onload=alert(1)>'),
    ]);
    expect(fake.status).toBe(415);
    expect((await xray.report(study.id, { report: 'سليم', abnormal: 'false' }, [PNG])).status).toBe(
      404,
    );
    await karim.start(study.id);
    expect((await omar.report(study.id, { report: 'سليم', abnormal: 'false' }, [PNG])).status).toBe(
      403,
    );
    expect(
      (await prisma.radiologyImage.findUniqueOrThrow({ where: { id: study.id } })).status,
    ).toBe('IN_PROGRESS');
  });
});
