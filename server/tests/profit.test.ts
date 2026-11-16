import { zonedInstant } from '@nabd/shared';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { forHospital } from '../src/lib/scopedPrisma.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { lastMonths, monthlyProfit, monthOf } from '../src/services/profit.service.js';
import { createHospital, createUser } from './helpers.js';

const app = createApp();
const hospitalIds: string[] = [];

afterEach(async () => {
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds.splice(0) } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('monthly profit (task 4.17)', () => {
  it('counts months in hospital time, across a new year', () => {
    expect(lastMonths(3, '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
    // 23:30 on 31 October in Damascus is still October there.
    expect(monthOf(zonedInstant('2026-10-31', 23 * 60 + 30))).toBe('2026-10');
  });

  it('revenue − approved purchases − salaries, month by month', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const db = forHospital(id);
    const dept = await prisma.department.create({ data: { hospitalId: id, name: 'د' } });
    const staff = async (salary: number, hiredAt: string, isActive = true) => {
      const user = await createUser(id, {
        email: `s-${crypto.randomUUID()}@nabd.test`,
        password: 'x',
        role: 'NURSE',
      });
      await prisma.user.update({ where: { id: user.id }, data: { isActive } });
      await prisma.staffProfile.create({
        data: {
          hospitalId: id,
          userId: user.id,
          departmentId: dept.id,
          salary,
          hiredAt: new Date(hiredAt),
        },
      });
    };
    await staff(1_000_000, '2026-01-01');
    // Started in October: not paid in September.
    await staff(500_000, '2026-10-15');
    // No longer working here.
    await staff(9_000_000, '2026-01-01', false);

    const patient = await prisma.patient.create({ data: { hospitalId: id, fullName: 'س' } });
    const invoice = await prisma.invoice.create({
      data: { hospitalId: id, patientId: patient.id, number: 1, total: 5_000_000 },
    });
    const pay = (amount: number, date: string) =>
      prisma.payment.create({
        data: {
          hospitalId: id,
          invoiceId: invoice.id,
          amount,
          method: 'CASH',
          paidAt: zonedInstant(date, 12 * 60),
        },
      });
    await pay(3_000_000, '2026-09-10');
    await pay(2_000_000, '2026-10-20');
    const buy = (totalCost: number, date: string, status: 'APPROVED' | 'REJECTED') =>
      prisma.purchaseRequest.create({
        data: {
          hospitalId: id,
          departmentId: dept.id,
          totalCost,
          status,
          decidedAt: zonedInstant(date, 12 * 60),
        },
      });
    await buy(400_000, '2026-10-05', 'APPROVED');
    await buy(999_999, '2026-10-06', 'REJECTED');

    expect(await monthlyProfit(db, ['2026-09', '2026-10'])).toEqual([
      {
        month: '2026-09',
        revenue: 3_000_000,
        purchases: 0,
        salaries: 1_000_000,
        profit: 2_000_000,
      },
      {
        month: '2026-10',
        revenue: 2_000_000,
        purchases: 400_000,
        salaries: 1_500_000,
        profit: 100_000,
      },
    ]);
  });

  it('is the admin’s', async () => {
    const { id } = await createHospital();
    hospitalIds.push(id);
    const admin = await createUser(id, {
      email: `a-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'ADMIN',
    });
    const res = await request(app)
      .get('/api/profit')
      .query({ months: 6 })
      .set({
        Authorization: `Bearer ${signAccessToken({ sub: admin.id, hospitalId: id, role: 'ADMIN' })}`,
      });
    expect(res.body.months).toHaveLength(6);
    const nurse = await createUser(id, {
      email: `n-${crypto.randomUUID()}@nabd.test`,
      password: 'x',
      role: 'NURSE',
    });
    expect(
      (
        await request(app)
          .get('/api/profit')
          .set({
            Authorization: `Bearer ${signAccessToken({ sub: nurse.id, hospitalId: id, role: 'NURSE' })}`,
          })
      ).status,
    ).toBe(403);
  });
});
