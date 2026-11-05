import type { Gender } from './schemas/patient.js';
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

/** Bookings still holding their slot: these are the ones a new booking may not overlap. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['SCHEDULED', 'IN_PROGRESS'];

/** Whether two time ranges overlap; touching ends (10:00–11:00 and 11:00–12:00) do not. */
export function overlaps(
  a: { startsAt: string | Date; endsAt: string | Date },
  b: { startsAt: string | Date; endsAt: string | Date },
) {
  return new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);
}

/** A booking as the schedule shows it; other doctors' patients stay private. */
export type BookingView = {
  id: string;
  kind: BookingKind;
  status: BookingStatus;
  operatingRoom: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string;
  surgeonName: string;
  mine: boolean;
  /** Only on my own bookings. */
  procedure: string | null;
  patient: {
    id: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: Gender | null;
    dateOfBirth: string | null;
  } | null;
};

export const BOOKING_DURATIONS = [30, 60, 90, 120, 180, 240, 360] as const;
