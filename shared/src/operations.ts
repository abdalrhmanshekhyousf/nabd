import type { DepartmentCode } from './schemas/department.js';
import type { OperatingRoomStatus } from './schemas/operatingRoom.js';
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
  /** When the operation really started (task 2.22). */
  startedAt: string | null;
  /** Only on my own bookings, and for the operating room team. */
  procedure: string | null;
  notes: string | null;
  patient: {
    id: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: Gender | null;
    dateOfBirth: string | null;
  } | null;
};

export const BOOKING_DURATIONS = [30, 60, 90, 120, 180, 240, 360] as const;

/**
 * One room on the operating room nurse's board (task 2.22): the operation in
 * it now, and the ones waiting for it, emergencies first.
 */
export type OrBoardRoom = {
  id: string;
  name: string;
  status: OperatingRoomStatus;
  statusChangedAt: string;
  current: BookingView | null;
  queue: BookingView[];
};

/** A cleaning or sterilization job as the cleaners' board shows it (task 2.24). */
export type CleaningRequestView = {
  id: string;
  kind: CleaningKind;
  status: CleaningStatus;
  department: { id: string; name: string; code: DepartmentCode | null };
  /** The room, bed or place to clean, as written when requested. */
  place: string | null;
  operatingRoom: { id: string; name: string } | null;
  note: string | null;
  requestedBy: string | null;
  assignedTo: { id: string; fullName: string } | null;
  /** Taken by the person looking at it. */
  mine: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};
