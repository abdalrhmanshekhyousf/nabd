import { zonedDate, type AdminOverview } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { monthlyProfit, monthOf } from './profit.service.js';

/**
 * The admin's home (task 4.20): the hospital at a glance. Staff, who is away
 * today, what waits for a decision, open complaints, beds and operating rooms
 * by status, and this month's money.
 */
export async function adminOverview(db: ScopedPrisma): Promise<AdminOverview> {
  const today = new Date(`${zonedDate(new Date())}T00:00:00Z`);
  const [
    staff,
    awayToday,
    leave,
    purchases,
    repairs,
    complaints,
    beds,
    operatingRooms,
    meetings,
    unreadReports,
    [month],
  ] = await Promise.all([
    db.user.groupBy({
      by: ['role'],
      where: { isActive: true, role: { notIn: ['PATIENT'] } },
      _count: { _all: true },
    }),
    db.leaveRequest.count({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
    }),
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.purchaseRequest.count({ where: { status: 'PENDING' } }),
    db.repairRequest.count({ where: { status: 'PENDING' } }),
    db.complaint.count({ where: { status: 'OPEN' } }),
    db.bed.groupBy({ by: ['status'], _count: { _all: true } }),
    db.operatingRoom.groupBy({ by: ['status'], _count: { _all: true } }),
    db.meeting.count({
      where: { startsAt: { gte: new Date() }, status: { in: ['REQUESTED', 'ACCEPTED'] } },
    }),
    db.report.count({ where: { readAt: null } }),
    monthlyProfit(db, [monthOf(new Date())]),
  ]);
  return {
    staff: {
      total: staff.reduce((sum, row) => sum + row._count._all, 0),
      byRole: staff
        .map((row) => ({ role: row.role, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      awayToday,
    },
    pending: { leave, purchases, repairs },
    openComplaints: complaints,
    beds: beds.map((row) => ({ status: row.status, count: row._count._all })),
    operatingRooms: operatingRooms.map((row) => ({ status: row.status, count: row._count._all })),
    upcomingMeetings: meetings,
    unreadReports,
    month: month!,
  };
}
