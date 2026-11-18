// Hospital isolation with two demo hospitals (task 5.2): both are seeded in
// full, then every person of the first, in every role, opens every page of
// the API: nothing of the second hospital may ever come back. Its patients,
// staff, rooms, invoices… are recognised by their ids (both demos use the
// same names on purpose, so only ids tell them apart).
import { addLocalDays, zonedDate } from '@nabd/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_USERS, seedDemo } from '../prisma/demo.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { allRoutes } from './routes.js';

const app = createApp();
const seeded: string[] = [];

afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: seeded } } });
  await prisma.$disconnect();
});

const demo = (name: string) => ({
  name: `${name} ${crypto.randomUUID()}`,
  address: 'دمشق',
  phone: '+963 11 000 0000',
  email: 'isolation@nabd.test',
});

/** Every id of the hospital's own records, to look for in the other's answers. */
async function idsOf(hospitalId: string) {
  const where = { where: { hospitalId }, select: { id: true } };
  const groups = await Promise.all([
    prisma.patient.findMany(where),
    prisma.user.findMany(where),
    prisma.department.findMany(where),
    prisma.room.findMany(where),
    prisma.bed.findMany(where),
    prisma.operatingRoom.findMany(where),
    prisma.inventoryItem.findMany(where),
    prisma.invoice.findMany(where),
    prisma.prescription.findMany(where),
    prisma.labTest.findMany(where),
    prisma.appointment.findMany(where),
    prisma.triageAssessment.findMany(where),
    prisma.leaveRequest.findMany(where),
    prisma.complaint.findMany(where),
  ]);
  return new Set([hospitalId, ...groups.flat().map((row) => row.id)]);
}

describe('two demo hospitals stay apart (task 5.2)', () => {
  it('no one of the first hospital ever sees a record of the second, on any page', async () => {
    const a = (await seedDemo(demo('مستشفى العزل أ'), { sampleStock: true })).hospital.id;
    seeded.push(a);
    const b = (await seedDemo(demo('مستشفى العزل ب'), { sampleStock: true })).hospital.id;
    seeded.push(b);
    const theirs = await idsOf(b);
    const ours = await idsOf(a);
    expect(theirs.size).toBeGreaterThan(500);

    // Things of the other hospital to put in paths: a patient, a person, an invoice…
    const [patient, invoice, test, visit] = await Promise.all([
      prisma.patient.findFirstOrThrow({ where: { hospitalId: b, isAnonymous: false } }),
      prisma.invoice.findFirstOrThrow({ where: { hospitalId: b } }),
      prisma.labTest.findFirstOrThrow({ where: { hospitalId: b } }),
      prisma.triageAssessment.findFirstOrThrow({ where: { hospitalId: b } }),
    ]);
    const foreign: Record<string, string> = {
      patientId: patient.id,
      id: invoice.id,
      testId: test.id,
      visitId: visit.id,
    };
    const today = zonedDate(new Date());

    const routes = (await allRoutes()).filter(
      (route) =>
        route.method === 'get' &&
        !['/api/auth', '/api/health', '/api/public'].includes(route.prefix),
    );
    const leaks: string[] = [];
    // The pages did answer, with the hospital's own records: the test has teeth.
    let answered = 0;
    let ownSeen = 0;
    for (const { role, email } of DEMO_USERS) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { hospitalId_email: { hospitalId: a, email } },
      });
      const auth = {
        Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId: a, role })}`,
      };
      for (const route of routes) {
        const path = route.path.replace(/:(\w+)/g, (_, name: string) => foreign[name] ?? visit.id);
        const res = await request(app)
          .get(path)
          .query({ date: today, from: addLocalDays(today, -30), to: today, search: '' })
          .set(auth);
        if (res.status >= 400) continue;
        answered += 1;
        const body = typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.text);
        const found = [
          ...body.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g),
        ]
          .map((m) => m[0])
          .filter((id) => theirs.has(id));
        if (
          body
            .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)
            ?.some((id) => ours.has(id))
        ) {
          ownSeen += 1;
        }
        if (found.length) leaks.push(`${role} GET ${route.path}: ${found.slice(0, 3).join(', ')}`);
      }
    }
    expect(leaks).toEqual([]);
    expect(answered).toBeGreaterThan(100);
    expect(ownSeen).toBeGreaterThan(50);
  }, 600_000);
});
