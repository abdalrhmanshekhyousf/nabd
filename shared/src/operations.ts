/** Operating room bookings (task 2.18). Match the Prisma enums. */
export const BOOKING_KINDS = ['SCHEDULED', 'EMERGENCY'] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export const BOOKING_STATUSES = [
  'SCHEDULED',
  'POSTPONED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Cleaning and sterilization jobs (tasks 2.18, 2.23–2.25). */
export const CLEANING_KINDS = ['CLEANING', 'STERILIZATION'] as const;
export type CleaningKind = (typeof CLEANING_KINDS)[number];

export const CLEANING_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type CleaningStatus = (typeof CLEANING_STATUSES)[number];

/** One line of an operating room's history: from, to, who and when. */
export type RoomStatusChange = {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedByName: string;
  bookingId: string | null;
  createdAt: string;
};
