/** Matches the ServiceKind enum (tasks 4.11, 4.12): what a charge is for. */
export const SERVICE_KINDS = [
  'VISIT',
  'OPERATION',
  'LAB_TEST',
  'IMAGING',
  'DRUG',
  'BED_DAY',
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

/** Matches the InvoiceStatus enum. */
export const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Matches the PaymentMethod enum (4.14). Online payment is out of scope. */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A charge on a patient's account (4.12). Money as numbers. */
export type ChargeView = {
  id: string;
  kind: ServiceKind;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  invoiceId: string | null;
  createdAt: string;
};

/** A payment against an invoice (4.14). */
export type PaymentView = {
  id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  receivedByName: string | null;
  paidAt: string;
};

/** An invoice with its lines and payments (4.13–4.15). */
export type InvoiceView = {
  id: string;
  number: number;
  status: InvoiceStatus;
  total: number;
  paid: number;
  issuedAt: string;
  issuedByName: string | null;
  patient: { id: string; fullName: string | null; isAnonymous: boolean; phone: string | null };
  items: ChargeView[];
  payments: PaymentView[];
};

/** A line of the hospital's price list (4.12). */
export type ServicePriceView = {
  id: string;
  kind: ServiceKind;
  code: string;
  name: string;
  price: number;
};

/**
 * Built-in prices (Syrian pounds) when the hospital's price list has none for
 * a service (4.12). The accountant sets the real ones.
 */
export const DEFAULT_PRICES: Record<ServiceKind, number> = {
  VISIT: 50_000,
  OPERATION: 2_000_000,
  LAB_TEST: 25_000,
  IMAGING: 100_000,
  DRUG: 10_000,
  BED_DAY: 150_000,
};

/** One month of the hospital's profit (task 4.17). Money in Syrian pounds. */
export type MonthProfit = {
  /** "2026-11" in hospital time. */
  month: string;
  /** Payments received. */
  revenue: number;
  /** Purchases the admin approved. */
  purchases: number;
  /** Salaries of the staff employed that month. */
  salaries: number;
  profit: number;
};
