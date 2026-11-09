import type { BedStatus } from './schemas/room.js';

/**
 * Where a bed may go from each state (task 3.15). A patient is admitted to an
 * empty or reserved bed; leaving it (discharge or move) sends it to cleaning,
 * and only cleaning brings it back empty. The admin takes an empty bed out of
 * service and brings it back.
 */
export const BED_TRANSITIONS: Record<BedStatus, readonly BedStatus[]> = {
  EMPTY: ['RESERVED', 'OCCUPIED', 'OUT_OF_SERVICE'],
  RESERVED: ['OCCUPIED', 'EMPTY'],
  OCCUPIED: ['CLEANING'],
  CLEANING: ['EMPTY'],
  OUT_OF_SERVICE: ['EMPTY'],
};

export const canChangeBed = (from: BedStatus, to: BedStatus) => BED_TRANSITIONS[from].includes(to);

/** One line of a bed's history, newest first. */
export type BedStatusChangeView = {
  id: string;
  fromStatus: BedStatus;
  toStatus: BedStatus;
  reason: string | null;
  changedByName: string;
  createdAt: string;
  /** The patient of the stay the change belongs to, when it does. */
  patientName: string | null;
};
