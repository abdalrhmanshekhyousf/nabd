import type { DecisionData, RequestKind } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  purchaseInclude,
  repairInclude,
  toPurchaseView,
  toRepairView,
} from './departmentRequest.service.js';
import { leaveInclude, toLeaveView } from './leave.service.js';
import { sendNotification } from './notification.service.js';

/**
 * The admin's approvals (task 4.7): leave, purchase and repair requests. The
 * pending ones first, oldest first so nobody waits longest; then the last
 * decided ones.
 */
export async function approvals(db: ScopedPrisma, status: 'PENDING' | 'DECIDED') {
  const where =
    status === 'PENDING'
      ? { status: 'PENDING' as const }
      : { status: { in: ['APPROVED' as const, 'REJECTED' as const] } };
  const orderBy =
    status === 'PENDING' ? { createdAt: 'asc' as const } : { decidedAt: 'desc' as const };
  const take = status === 'PENDING' ? 200 : 30;
  const [leave, purchases, repairs] = await Promise.all([
    db.leaveRequest.findMany({ where, include: leaveInclude, orderBy, take }),
    db.purchaseRequest.findMany({ where, include: purchaseInclude, orderBy, take }),
    db.repairRequest.findMany({ where, include: repairInclude, orderBy, take }),
  ]);
  return {
    leave: leave.map(toLeaveView),
    purchases: purchases.map(toPurchaseView),
    repairs: repairs.map(toRepairView),
  };
}

/** How many requests wait for the admin (for the admin home, 4.20). */
export async function pendingCount(db: ScopedPrisma) {
  const where = { status: 'PENDING' as const };
  const counts = await Promise.all([
    db.leaveRequest.count({ where }),
    db.purchaseRequest.count({ where }),
    db.repairRequest.count({ where }),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * The admin approves or rejects a pending request (task 4.7); a rejection says
 * why. The requester is told. An approved leave also tells the head of the
 * person's department that they will be away (user addition).
 */
export async function decide(
  db: ScopedPrisma,
  hospitalId: string,
  adminId: string,
  kind: RequestKind,
  id: string,
  { decision, note }: DecisionData,
) {
  if (decision === 'REJECTED' && !note) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Say why it is rejected', {
      issues: [{ path: ['note'], message: 'validation.required' }],
    });
  }
  const where = { id, status: 'PENDING' as const };
  const data = {
    status: decision,
    decidedById: adminId,
    decidedAt: new Date(),
    decisionNote: note,
  };
  const { count } =
    kind === 'leave'
      ? await db.leaveRequest.updateMany({ where, data })
      : kind === 'purchase'
        ? await db.purchaseRequest.updateMany({ where, data })
        : await db.repairRequest.updateMany({ where, data });
  if (count === 0) {
    const exists =
      kind === 'leave'
        ? await db.leaveRequest.findUnique({ where: { id }, select: { id: true } })
        : kind === 'purchase'
          ? await db.purchaseRequest.findUnique({ where: { id }, select: { id: true } })
          : await db.repairRequest.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
    throw new HttpError(409, 'INVALID_TRANSITION', 'This request was already decided');
  }

  if (kind === 'leave') {
    const leave = toLeaveView(
      await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: leaveInclude }),
    );
    await sendNotification(db, hospitalId, {
      to: { userIds: [leave.requester.id] },
      type: 'REQUEST_DECIDED',
      data: { kind, decision, note, from: leave.from, to: leave.to },
      link: null,
    });
    const departmentId = leave.requester.department?.id;
    if (decision === 'APPROVED' && departmentId) {
      const department = await db.department.findUnique({
        where: { id: departmentId },
        select: { headId: true },
      });
      if (department?.headId && department.headId !== leave.requester.id) {
        await sendNotification(db, hospitalId, {
          to: { userIds: [department.headId] },
          type: 'STAFF_AWAY',
          data: { name: leave.requester.fullName, from: leave.from, to: leave.to },
          link: null,
        });
      }
    }
    return { kind, request: leave, departmentId };
  }
  if (kind === 'purchase') {
    const purchase = toPurchaseView(
      await db.purchaseRequest.findUniqueOrThrow({ where: { id }, include: purchaseInclude }),
    );
    const row = await db.purchaseRequest.findUniqueOrThrow({
      where: { id },
      select: { requestedById: true },
    });
    if (row.requestedById) {
      await sendNotification(db, hospitalId, {
        to: { userIds: [row.requestedById] },
        type: 'REQUEST_DECIDED',
        data: { kind, decision, note, total: purchase.totalCost },
        link: null,
      });
    }
    return { kind, request: purchase, departmentId: purchase.department.id };
  }
  const repair = toRepairView(
    await db.repairRequest.findUniqueOrThrow({ where: { id }, include: repairInclude }),
  );
  const row = await db.repairRequest.findUniqueOrThrow({
    where: { id },
    select: { requestedById: true },
  });
  if (row.requestedById) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [row.requestedById] },
      type: 'REQUEST_DECIDED',
      data: { kind, decision, note, equipment: repair.equipment },
      link: null,
    });
  }
  return { kind, request: repair, departmentId: repair.department.id };
}
