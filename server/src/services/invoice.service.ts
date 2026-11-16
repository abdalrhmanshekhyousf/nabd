import type { ChargeView, InvoiceView, PaymentData, PaymentView } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const patientSelect = { id: true, fullName: true, isAnonymous: true, phone: true } as const;

type ItemRow = Prisma.InvoiceItemGetPayload<object>;

export function toChargeView(row: ItemRow): ChargeView {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    quantity: row.quantity,
    unitPrice: Number(row.unitPrice),
    total: Number(row.total),
    invoiceId: row.invoiceId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const invoiceInclude = {
  patient: { select: patientSelect },
  issuedBy: { select: { fullName: true } },
  items: { orderBy: { createdAt: 'asc' } },
  payments: { include: { receivedBy: { select: { fullName: true } } }, orderBy: { paidAt: 'asc' } },
} as const satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    total: Number(row.total),
    paid: Number(row.paid),
    issuedAt: row.issuedAt.toISOString(),
    issuedByName: row.issuedBy?.fullName ?? null,
    patient: row.patient,
    items: row.items.map(toChargeView),
    payments: row.payments.map((payment): PaymentView => ({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      note: payment.note,
      receivedByName: payment.receivedBy?.fullName ?? null,
      paidAt: payment.paidAt.toISOString(),
    })),
  };
}

/** Patients with charges not invoiced yet (4.13), most owed first; or found by name. */
export async function openAccounts(db: ScopedPrisma, search: string) {
  const grouped = await db.invoiceItem.groupBy({
    by: ['patientId'],
    where: { invoiceId: null },
    _sum: { total: true },
    _count: { _all: true },
  });
  const ids = grouped.map((row) => row.patientId);
  const patients = await db.patient.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { nationalId: { startsWith: search } },
          ],
        }
      : { id: { in: ids } },
    select: patientSelect,
    take: 50,
  });
  const open = new Map(grouped.map((row) => [row.patientId, row]));
  return patients
    .map((patient) => ({
      patient,
      openTotal: Number(open.get(patient.id)?._sum.total ?? 0),
      openCount: open.get(patient.id)?._count._all ?? 0,
    }))
    .sort((a, b) => b.openTotal - a.openTotal);
}

/** One patient's account: what is not invoiced yet, and their invoices. */
export async function patientAccount(db: ScopedPrisma, patientId: string) {
  const patient = await db.patient.findUnique({ where: { id: patientId }, select: patientSelect });
  if (!patient) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  const [open, invoices] = await Promise.all([
    db.invoiceItem.findMany({
      where: { patientId, invoiceId: null },
      orderBy: { createdAt: 'asc' },
    }),
    db.invoice.findMany({
      where: { patientId },
      include: invoiceInclude,
      orderBy: { issuedAt: 'desc' },
    }),
  ]);
  return { patient, open: open.map(toChargeView), invoices: invoices.map(toInvoiceView) };
}

/**
 * The accountant issues an invoice (4.13) for some or all of a patient's open
 * charges. Numbers count up per hospital; two invoices issued at once get
 * different numbers (the unique number makes one retry), and a charge can
 * only be on one invoice.
 */
export async function issueInvoice(
  db: ScopedPrisma,
  hospitalId: string,
  accountantId: string,
  patientId: string,
  itemIds: string[] | null,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const id = await db.$transaction(async (tx) => {
        const items = await tx.invoiceItem.findMany({
          where: { patientId, invoiceId: null, ...(itemIds ? { id: { in: itemIds } } : {}) },
          select: { id: true, total: true },
        });
        if (items.length === 0 || (itemIds && items.length !== itemIds.length)) {
          throw new HttpError(409, 'INVALID_TRANSITION', 'Nothing open to invoice');
        }
        const last = await tx.invoice.findFirst({
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        const total = items.reduce((sum, item) => sum + Number(item.total), 0);
        const invoice = await tx.invoice.create({
          data: {
            hospitalId,
            patientId,
            number: (last?.number ?? 0) + 1,
            total,
            issuedById: accountantId,
          },
          select: { id: true },
        });
        const { count } = await tx.invoiceItem.updateMany({
          where: { id: { in: items.map((item) => item.id) }, invoiceId: null },
          data: { invoiceId: invoice.id },
        });
        if (count !== items.length) {
          throw new HttpError(409, 'INVALID_TRANSITION', 'A charge was invoiced meanwhile');
        }
        return invoice.id;
      });
      return toInvoiceView(
        await db.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude }),
      );
    } catch (error) {
      const numberTaken =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!numberTaken || attempt === 2) throw error;
    }
  }
  throw new HttpError(409, 'INVALID_TRANSITION', 'Try again');
}

export async function getInvoice(db: ScopedPrisma, id: string) {
  const row = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Invoice not found');
  return toInvoiceView(row);
}

/** Invoices still owed (4.14), oldest first; or the last paid ones. */
export async function invoicesByStatus(db: ScopedPrisma, status: 'OWED' | 'PAID', search: string) {
  const rows = await db.invoice.findMany({
    where: {
      status: status === 'OWED' ? { in: ['ISSUED', 'PARTIALLY_PAID'] } : 'PAID',
      ...(search
        ? {
            OR: [
              { patient: { fullName: { contains: search, mode: 'insensitive' } } },
              ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
            ],
          }
        : {}),
    },
    include: invoiceInclude,
    orderBy: status === 'OWED' ? { issuedAt: 'asc' } : { updatedAt: 'desc' },
    take: status === 'OWED' ? 200 : 50,
  });
  return rows.map(toInvoiceView);
}

/**
 * A payment against an invoice (4.14): never more than is due. The invoice is
 * locked meanwhile, so two payments at once cannot both take the last amount.
 */
export async function recordPayment(
  db: ScopedPrisma,
  hospitalId: string,
  accountantId: string,
  invoiceId: string,
  { amount, method, note }: PaymentData,
) {
  await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ total: string; paid: string; status: string }[]>`
      SELECT total, paid, status FROM "Invoice"
      WHERE id = ${invoiceId}::uuid AND "hospitalId" = ${hospitalId}::uuid
      FOR UPDATE`;
    const invoice = locked[0];
    if (!invoice) throw new HttpError(404, 'NOT_FOUND', 'Invoice not found');
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      throw new HttpError(409, 'INVALID_TRANSITION', 'This invoice is settled');
    }
    const due = Number(invoice.total) - Number(invoice.paid);
    if (amount > due + 0.001) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'More than is due', {
        issues: [{ path: ['amount'], message: 'validation.invalid' }],
      });
    }
    await tx.payment.create({
      data: { hospitalId, invoiceId, amount, method, note, receivedById: accountantId },
    });
    const paid = Number(invoice.paid) + amount;
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paid,
        status: paid + 0.001 >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
  });
  return getInvoice(db, invoiceId);
}

/** The patient's own invoices (4.15), and what is not invoiced yet. */
export async function myInvoices(db: ScopedPrisma, patientId: string) {
  const [invoices, open] = await Promise.all([
    db.invoice.findMany({
      where: { patientId, status: { not: 'CANCELLED' } },
      include: invoiceInclude,
      orderBy: { issuedAt: 'desc' },
    }),
    db.invoiceItem.findMany({
      where: { patientId, invoiceId: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { invoices: invoices.map(toInvoiceView), open: open.map(toChargeView) };
}
