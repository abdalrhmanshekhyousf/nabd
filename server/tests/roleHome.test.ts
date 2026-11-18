import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { seedDemo, DEMO_USERS } from '../prisma/demo.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { signAccessToken } from '../src/lib/tokens.js';

const app = createApp();
let hospitalId = '';

afterAll(async () => {
  if (hospitalId) await prisma.hospital.delete({ where: { id: hospitalId } });
  await prisma.$disconnect();
});

describe("each role's home (after 4.24)", () => {
  it("shows today's work of every role in the demo, each tile leading to its page", async () => {
    hospitalId = (
      await seedDemo(
        {
          name: `مستشفى الصفحة الرئيسية ${crypto.randomUUID()}`,
          address: 'دمشق',
          phone: '+963 11 000 0000',
          email: 'home@nabd.test',
        },
        { sampleStock: true },
      )
    ).hospital.id;
    const homes: Record<string, { key: string; value: number | null; to: string }[]> = {};
    for (const { role, email } of DEMO_USERS) {
      if (role === 'ADMIN') continue;
      const user = await prisma.user.findUniqueOrThrow({
        where: { hospitalId_email: { hospitalId, email } },
      });
      const res = await request(app)
        .get('/api/me/home')
        .set({
          Authorization: `Bearer ${signAccessToken({ sub: user.id, hospitalId, role })}`,
        });
      expect(res.status).toBe(200);
      homes[role] = res.body.tiles;
      expect(res.body.tiles.length).toBeGreaterThan(2);
      for (const tile of res.body.tiles) expect(tile.to).toMatch(/^\/[a-z]+(\/[a-z-]+)?$/);
    }
    const value = (role: string, key: string) => homes[role]!.find((t) => t.key === key)?.value;
    // The demo's working week shows: prescriptions and tests waiting, beds taken.
    expect(value('PHARMACIST', 'prescriptionsWaiting')).toBeGreaterThan(0);
    expect(value('LAB_TECHNICIAN', 'testsWaiting')).toBeGreaterThan(0);
    // An ER nurse sees the waiting list; a ward nurse, the beds.
    expect(value('NURSE', 'erWaiting') ?? value('NURSE', 'bedsOccupied')).toBeGreaterThan(0);
    expect(value('DOCTOR', 'myPatients')).toBeGreaterThan(0);
    expect(value('ACCOUNTANT', 'owed')).toBeGreaterThan(0);
    expect(homes.PATIENT!.map((t) => t.key)).toEqual(['nextVisit', 'reminders', 'due', 'results']);
  }, 180_000);
});
