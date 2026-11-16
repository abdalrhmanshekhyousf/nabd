import type { ServiceKind } from './accounting.js';

/** Reports departments send the admin (task 3.11). Match the Prisma enum. */
export const REPORT_KINDS = ['PHARMACY', 'REVENUE'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

type Counted = { name: string; unit: string; quantity: number };

/**
 * The pharmacy's figures for a period (task 3.11), worked out when the report
 * is sent and kept as they were.
 */
export type PharmacyReportData = {
  prescriptions: { dispensed: number; withMissing: number; waiting: number };
  /** Medicines handed over, most first. */
  dispensed: Counted[];
  /** Prescribed medicines that were not available, most asked first. */
  unavailable: { drugName: string; times: number }[];
  /** Stock received. */
  received: Counted[];
  /** At the time of the report: items at or under their minimum, and those out. */
  low: (Counted & { minQuantity: number })[];
  outOfStock: number;
};

/**
 * The month's revenue (task 4.16), worked out when the accountant sends it:
 * money received, invoices issued, services given, and what is still owed.
 */
export type RevenueReportData = {
  received: number;
  byMethod: { method: 'CASH' | 'CARD' | 'TRANSFER'; amount: number }[];
  invoices: { issued: number; issuedTotal: number; paid: number };
  /** Services given in the period, by kind, at their charged price. */
  byService: { kind: ServiceKind; amount: number; count: number }[];
  /** At the time of the report: everything invoiced and not paid yet. */
  outstanding: number;
};

/** A sent report, as its author and the admin see it. */
export type ReportView = {
  id: string;
  kind: ReportKind;
  periodFrom: string;
  periodTo: string;
  data: PharmacyReportData | RevenueReportData;
  notes: string | null;
  authorName: string;
  readAt: string | null;
  createdAt: string;
};
