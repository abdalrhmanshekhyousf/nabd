/**
 * A prescription waits for the pharmacist, then is dispensed or cancelled
 * (tasks 2.6, 3.10). Matches the PrescriptionStatus enum.
 */
export const PRESCRIPTION_STATUSES = ['PENDING', 'DISPENSED', 'CANCELLED'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];
