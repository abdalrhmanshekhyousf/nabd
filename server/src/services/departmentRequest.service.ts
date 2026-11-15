import type {
  DepartmentRequestContext,
  PurchaseRequestData,
  PurchaseView,
  RepairRequestData,
  RepairView,
  ShortItem,
} from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sendNotification } from './notification.service.js';

const departmentRef = { select: { id: true, name: true, code: true } } as const;

/** My department, its head, and whether I am it (task 4.6). */
export async function requestContext(
  db: ScopedPrisma,
  userId: string,
): Promise<DepartmentRequestContext> {
  const profile = await db.staffProfile.findUnique({
    where: { userId },
    select: {
      department: {
        select: {
          id: true,
          name: true,
          code: true,
          head: { select: { id: true, fullName: true, role: true } },
        },
      },
    },
  });
  const department = profile?.department ?? null;
  if (!department) return { department: null, head: null, isHead: false };
  const { head, ...ref } = department;
  return { department: ref, head, isHead: head?.id === userId };
}

async function myDepartment(db: ScopedPrisma, userId: string) {
  const context = await requestContext(db, userId);
  if (!context.department) {
    throw new HttpError(403, 'FORBIDDEN', 'You are not in a department');
  }
  return context;
}

/** Only the head files requests for the department (user addition). */
async function requireHead(db: ScopedPrisma, userId: string) {
  const context = await myDepartment(db, userId);
  if (!context.isHead) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the head of the department files its requests');
  }
  return context.department!;
}

export const purchaseInclude = {
  department: departmentRef,
  requestedBy: { select: { fullName: true } },
  items: { orderBy: { name: 'asc' } },
} as const satisfies Prisma.PurchaseRequestInclude;

type PurchaseRow = Prisma.PurchaseRequestGetPayload<{ include: typeof purchaseInclude }>;

export function toPurchaseView(row: PurchaseRow): PurchaseView {
  return {
    id: row.id,
    department: row.department,
    requestedByName: row.requestedBy?.fullName ?? null,
    note: row.note,
    totalCost: Number(row.totalCost),
    status: row.status,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      inventoryItemId: item.inventoryItemId,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitCost: Number(item.unitCost),
    })),
  };
}

export const repairInclude = {
  department: departmentRef,
  requestedBy: { select: { fullName: true } },
} as const satisfies Prisma.RepairRequestInclude;

type RepairRow = Prisma.RepairRequestGetPayload<{ include: typeof repairInclude }>;

export function toRepairView(row: RepairRow): RepairView {
  return {
    id: row.id,
    department: row.department,
    requestedByName: row.requestedBy?.fullName ?? null,
    equipment: row.equipment,
    description: row.description,
    urgency: row.urgency,
    status: row.status,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The department's purchase and repair requests, newest first: everyone in it sees them. */
export async function departmentRequests(db: ScopedPrisma, userId: string) {
  const { department } = await myDepartment(db, userId);
  const where = { departmentId: department!.id };
  const [purchases, repairs] = await Promise.all([
    db.purchaseRequest.findMany({
      where,
      include: purchaseInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.repairRequest.findMany({
      where,
      include: repairInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  return { purchases: purchases.map(toPurchaseView), repairs: repairs.map(toRepairView) };
}

const CATEGORY = { PHARMACY: 'DRUG', LABORATORY: 'LAB', RADIOLOGY: 'RADIOLOGY' } as const;

/** Stock of my department below its minimum (pharmacy, lab, radiology), to request. */
export async function shortages(db: ScopedPrisma, userId: string): Promise<ShortItem[]> {
  const { department } = await myDepartment(db, userId);
  const code = department!.code;
  const category = code && code in CATEGORY ? CATEGORY[code as keyof typeof CATEGORY] : null;
  if (!category) return [];
  const items = await db.inventoryItem.findMany({
    where: { category },
    select: { id: true, name: true, unit: true, quantity: true, minQuantity: true },
    orderBy: { name: 'asc' },
  });
  return items.filter((item) => item.quantity <= item.minQuantity);
}

/** The head asks to buy (task 4.6); the total is worked out here, and the admins told. */
export async function requestPurchase(
  db: ScopedPrisma,
  hospitalId: string,
  userId: string,
  { items, note }: PurchaseRequestData,
) {
  const department = await requireHead(db, userId);
  const totalCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const row = await db.purchaseRequest.create({
    data: {
      hospitalId,
      departmentId: department.id,
      requestedById: userId,
      note,
      totalCost,
      items: { create: items.map((item) => ({ ...item, hospitalId })) },
    },
    include: purchaseInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'ADMIN' },
    type: 'PURCHASE_REQUEST',
    data: { department: department.name, code: department.code, total: totalCost },
    link: '/admin/approvals',
  });
  return toPurchaseView(row);
}

/** The head reports equipment that needs repair (user addition); the admins are told. */
export async function requestRepair(
  db: ScopedPrisma,
  hospitalId: string,
  userId: string,
  input: RepairRequestData,
) {
  const department = await requireHead(db, userId);
  const row = await db.repairRequest.create({
    data: { hospitalId, departmentId: department.id, requestedById: userId, ...input },
    include: repairInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'ADMIN' },
    type: 'REPAIR_REQUEST',
    data: { department: department.name, code: department.code, equipment: input.equipment },
    link: '/admin/approvals',
  });
  return toRepairView(row);
}

/** The head withdraws a request of the department not decided yet. */
export async function withdrawRequest(
  db: ScopedPrisma,
  userId: string,
  kind: 'purchase' | 'repair',
  id: string,
) {
  const department = await requireHead(db, userId);
  const where = { id, departmentId: department.id, status: 'PENDING' as const };
  const data = { status: 'CANCELLED' as const };
  const { count } =
    kind === 'purchase'
      ? await db.purchaseRequest.updateMany({ where, data })
      : await db.repairRequest.updateMany({ where, data });
  if (count === 0) {
    const exists =
      kind === 'purchase'
        ? await db.purchaseRequest.findFirst({ where: { id, departmentId: department.id } })
        : await db.repairRequest.findFirst({ where: { id, departmentId: department.id } });
    if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Request not found');
    throw new HttpError(409, 'INVALID_TRANSITION', 'This request was already decided');
  }
}
