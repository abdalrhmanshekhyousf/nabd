import type {
  PharmacyReportData,
  ReportKind,
  ReportView,
  Role,
  SubmitReportData,
} from '@nabd/shared';
import type { Report } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from './notification.service.js';

/** The report each role writes (task 3.11); the admin reads them all. */
const KIND_OF_ROLE: Partial<Record<Role, ReportKind>> = { PHARMACIST: 'PHARMACY' };

export function reportKindFor(role: Role, asked?: ReportKind): ReportKind {
  const own = KIND_OF_ROLE[role];
  if (!own || (asked && asked !== own)) {
    throw new HttpError(403, 'FORBIDDEN', 'This report is not yours to write');
  }
  return own;
}

/** Sums by stock item, most first, with the item's name and unit. */
async function byItem(
  db: ScopedPrisma,
  kind: 'DISPENSE' | 'RESTOCK',
  from: Date,
  to: Date,
  limit: number,
) {
  const rows = await db.stockMovement.groupBy({
    by: ['itemId'],
    where: { kind, createdAt: { gte: from, lt: to }, item: { category: 'DRUG' } },
    _sum: { change: true },
  });
  const items = await db.inventoryItem.findMany({
    where: { id: { in: rows.map((row) => row.itemId) } },
    select: { id: true, name: true, unit: true },
  });
  return rows
    .map((row) => {
      const item = items.find((i) => i.id === row.itemId)!;
      return { name: item.name, unit: item.unit, quantity: Math.abs(row._sum.change ?? 0) };
    })
    .filter((row) => row.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * The pharmacy's figures for a period (task 3.11): prescriptions dispensed and
 * those missing a medicine, what was handed over and received, what patients
 * were prescribed but the pharmacy did not have, and the stock running low now.
 */
export async function pharmacyFigures(
  db: ScopedPrisma,
  from: Date,
  to: Date,
): Promise<PharmacyReportData> {
  const inPeriod = { status: 'DISPENSED' as const, dispensedAt: { gte: from, lt: to } };
  const [dispensedCount, withMissing, waiting, dispensed, received, missing, drugs] =
    await Promise.all([
      db.prescription.count({ where: inPeriod }),
      db.prescription.count({
        where: { ...inPeriod, items: { some: { dispensedQuantity: null } } },
      }),
      db.prescription.count({ where: { status: 'PENDING', createdAt: { lt: to } } }),
      byItem(db, 'DISPENSE', from, to, 15),
      byItem(db, 'RESTOCK', from, to, 15),
      db.prescriptionItem.groupBy({
        by: ['drugName'],
        where: { dispensedQuantity: null, prescription: inPeriod },
        _count: { _all: true },
      }),
      db.inventoryItem.findMany({
        where: { category: 'DRUG' },
        select: { name: true, unit: true, quantity: true, minQuantity: true },
      }),
    ]);
  return {
    prescriptions: { dispensed: dispensedCount, withMissing, waiting },
    dispensed,
    unavailable: missing
      .map((row) => ({ drugName: row.drugName, times: row._count._all }))
      .sort((a, b) => b.times - a.times)
      .slice(0, 10),
    received,
    low: drugs
      .filter((item) => item.minQuantity > 0 && item.quantity <= item.minQuantity)
      .sort((a, b) => a.quantity / a.minQuantity - b.quantity / b.minQuantity)
      .slice(0, 20),
    outOfStock: drugs.filter((item) => item.quantity === 0).length,
  };
}

function toView(report: Report): ReportView {
  return {
    id: report.id,
    kind: report.kind,
    periodFrom: report.periodFrom.toISOString(),
    periodTo: report.periodTo.toISOString(),
    data: report.data as PharmacyReportData,
    notes: report.notes,
    authorName: report.authorName,
    readAt: report.readAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
  };
}

/** What the report would say, before sending it. */
export function previewReport(db: ScopedPrisma, kind: ReportKind, from: Date, to: Date) {
  // One kind for now; the accountant's monthly report joins in 4.19.
  void kind;
  return pharmacyFigures(db, from, to);
}

/**
 * Sending the report (task 3.11): its figures are worked out now and kept,
 * with the author's notes; the admins are told.
 */
export async function submitReport(
  db: ScopedPrisma,
  hospitalId: string,
  authorId: string,
  { kind, from, to, notes, unavailable }: SubmitReportData,
) {
  const author = await db.user.findUnique({ where: { id: authorId }, select: { fullName: true } });
  const periodFrom = new Date(from);
  const periodTo = new Date(to);
  const worked = await previewReport(db, kind, periodFrom, periodTo);
  // The pharmacist's corrected list of missing medicines replaces the worked-out one.
  const data = unavailable ? { ...worked, unavailable } : worked;
  const report = await db.report.create({
    data: {
      hospitalId,
      kind,
      periodFrom,
      periodTo,
      data,
      notes,
      authorId,
      authorName: author?.fullName ?? '',
    },
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'ADMIN' },
    type: 'REPORT_SUBMITTED',
    data: { kind, author: report.authorName },
    link: `/admin/reports?open=${report.id}`,
  });
  emitRefresh(rooms.role(hospitalId, 'ADMIN'), [['reports']]);
  emitRefresh(rooms.role(hospitalId, 'PHARMACIST'), [['reports']]);
  return toView(report);
}

/** The reports this person may read: their department's, or all for the admin. */
export async function listReports(db: ScopedPrisma, role: Role) {
  const kind = role === 'ADMIN' ? undefined : reportKindFor(role);
  const reports = await db.report.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return reports.map(toView);
}

/** One report; the admin's first opening marks it read. */
export async function getReport(db: ScopedPrisma, role: Role, id: string) {
  const kind = role === 'ADMIN' ? undefined : reportKindFor(role);
  const report = await db.report.findFirst({ where: { id, ...(kind ? { kind } : {}) } });
  if (!report) throw new HttpError(404, 'NOT_FOUND', 'Report not found');
  if (role === 'ADMIN' && !report.readAt) {
    const read = await db.report.update({ where: { id }, data: { readAt: new Date() } });
    emitRefresh(rooms.role(report.hospitalId, 'ADMIN'), [['reports']]);
    // The author sees it read.
    if (report.authorId) emitRefresh(rooms.user(report.authorId), [['reports']]);
    return toView(read);
  }
  return toView(report);
}
