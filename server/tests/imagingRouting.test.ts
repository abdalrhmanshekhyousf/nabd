import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { attachRealtime, closeRealtime } from '../src/realtime/realtime.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
let url = '';
const hospitalIds: string[] = [];
const sockets: Socket[] = [];

beforeAll(async () => {
  const server = app.listen(0);
  attachRealtime(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await closeRealtime();
  await prisma.$disconnect();
});

type Modality = 'XRAY' | 'CT' | 'MRI' | 'ECHO' | 'ENDOSCOPY' | 'PANORAMIC';

async function radiology() {
  const { id } = await createHospital();
  hospitalIds.push(id);
  async function person(
    role: 'DOCTOR' | 'RADIOLOGIST',
    fullName: string,
    modality?: Modality | null,
  ) {
    const user = await createUser(id, {
      email: `${role}-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role,
    });
    await prisma.user.update({ where: { id: user.id }, data: { fullName } });
    if (modality !== undefined) {
      await prisma.staffProfile.create({
        data: { hospitalId: id, userId: user.id, radiologyModality: modality },
      });
    }
    const token = signAccessToken({ sub: user.id, hospitalId: id, role });
    const auth = { Authorization: `Bearer ${token}` };
    return {
      ...user,
      token,
      queue: () => request(app).get('/api/imaging').set(auth),
      start: (studyId: string) => request(app).post(`/api/imaging/${studyId}/start`).set(auth),
      staffed: () => request(app).get('/api/imaging/staffed').set(auth),
    };
  }
  const doctor = await person('DOCTOR', 'د. سامي');
  const patient = await prisma.patient.create({
    data: {
      hospitalId: id,
      fullName: 'سارة',
      medicalRecord: { create: { hospitalId: id, doctorId: doctor.id } },
    },
  });
  const order = (
    modality: Modality,
    bodyPart: string,
    priority: 'ROUTINE' | 'URGENT' = 'ROUTINE',
  ) =>
    request(app)
      .post(`/api/doctors/me/patients/${patient.id}/imaging`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({ modality, bodyPart, reason: null, priority });
  return { id, person, doctor, order };
}

describe('imaging routed by type (task 3.7)', () => {
  it('each radiologist sees only the studies of their own type, urgent first', async () => {
    const h = await radiology();
    const ct = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const echo = await h.person('RADIOLOGIST', 'ريما', 'ECHO');
    await h.order('CT', 'صدر');
    await h.order('ECHO', 'قلب');
    await h.order('CT', 'رأس', 'URGENT');

    const ctQueue = (await ct.queue()).body;
    expect(ctQueue.modality).toBe('CT');
    expect(ctQueue.studies.map((s: { bodyPart: string }) => s.bodyPart)).toEqual(['رأس', 'صدر']);
    expect(ctQueue.studies[0]).toMatchObject({ patient: { fullName: 'سارة' }, mine: false });
    expect((await echo.queue()).body.studies.map((s: { bodyPart: string }) => s.bodyPart)).toEqual([
      'قلب',
    ]);
  });

  it('only the radiologists of that type hear of a new study live', async () => {
    const h = await radiology();
    const ct = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const echo = await h.person('RADIOLOGIST', 'ريما', 'ECHO');
    const heard: Record<string, number> = { ct: 0, echo: 0 };
    for (const [name, person] of [
      ['ct', ct],
      ['echo', echo],
    ] as const) {
      const socket = connectClient(url, {
        auth: { token: person.token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.on('refresh', ({ queryKeys }: { queryKeys: string[][] }) => {
        if (queryKeys.some((key) => key[0] === 'imaging')) heard[name] += 1;
      });
      await new Promise((resolve) => socket.once('ready', resolve));
    }

    await h.order('CT', 'بطن وحوض', 'URGENT');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(heard).toEqual({ ct: 1, echo: 0 });
  });

  it('a radiologist takes a study of their type only; two at once: one gets it', async () => {
    const h = await radiology();
    const karim = await h.person('RADIOLOGIST', 'كريم', 'CT');
    const omar = await h.person('RADIOLOGIST', 'عمر', 'CT');
    const rima = await h.person('RADIOLOGIST', 'ريما', 'ECHO');
    const study = (await h.order('CT', 'رأس')).body.study;

    expect((await rima.start(study.id)).status).toBe(404);
    const results = await Promise.all([karim.start(study.id), omar.start(study.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_TAKEN');
    expect(results.find((r) => r.status === 200)!.body.study).toMatchObject({
      status: 'IN_PROGRESS',
      mine: true,
    });
  });

  it('tells doctors which types have someone, and a radiologist without a type to ask the admin', async () => {
    const h = await radiology();
    await h.person('RADIOLOGIST', 'كريم', 'CT');
    await h.person('RADIOLOGIST', 'ريما', 'ECHO');
    const unset = await h.person('RADIOLOGIST', 'جديد', null);

    expect((await h.doctor.staffed()).body.modalities.sort()).toEqual(['CT', 'ECHO']);
    expect((await unset.queue()).status).toBe(403);
  });
});
