import { zonedDate, type LeaveRequestData, type LeaveView } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sendNotification } from './notification.service.js';

export const leaveInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      role: true,
      staffProfile: { select: { department: { select: { id: true, name: true, code: true } } } },
    },
  },
  decidedBy: { select: { fullName: true } },
} as const;

type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

const day = (date: Date) => date.toISOString().slice(0, 10);

export function toLeaveView(row: LeaveRow): LeaveView {
  return {
    id: row.id,
    from: day(row.startDate),
    to: day(row.endDate),
    days: Math.round((row.endDate.getTime() - row.startDate.getTime()) / 86_400_000) + 1,
    reason: row.reason,
    status: row.status,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    requester: {
      id: row.user.id,
      fullName: row.user.fullName,
      role: row.user.role,
      department: row.user.staffProfile?.department ?? null,
    },
  };
}

/** My leave requests, newest first (task 4.5). */
export async function myLeave(db: ScopedPrisma, userId: string) {
  const rows = await db.leaveRequest.findMany({
    where: { userId },
    include: leaveInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(toLeaveView);
}

/**
 * A staff member asks for leave (task 4.5): from today on, not overlapping a
 * request of theirs still pending or approved. The admins are told.
 */
export async function requestLeave(
  db: ScopedPrisma,
  hospitalId: string,
  userId: string,
  { from, to, reason }: LeaveRequestData,
  now = new Date(),
) {
  if (from < zonedDate(now)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Leave starts today or later', {
      issues: [{ path: ['from'], message: 'validation.invalid' }],
    });
  }
  const startDate = new Date(`${from}T00:00:00Z`);
  const endDate = new Date(`${to}T00:00:00Z`);
  const overlap = await db.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (overlap) throw new HttpError(409, 'LEAVE_OVERLAP', 'You already asked for these days');

  const row = await db.leaveRequest.create({
    data: { hospitalId, userId, startDate, endDate, reason },
    include: leaveInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'ADMIN' },
    type: 'LEAVE_REQUEST',
    data: { name: row.user.fullName, from, to },
    link: '/admin/approvals',
  });
  return toLeaveView(row);
}

/** The requester withdraws a request the admin has not decided yet. */
export async function cancelLeave(db: ScopedPrisma, userId: string, id: string) {
  const { count } = await db.leaveRequest.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    const exists = await db.leaveRequest.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
    throw new HttpError(409, 'INVALID_TRANSITION', 'This request was already decided');
  }
  return toLeaveView(
    await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude }),
  );
}
