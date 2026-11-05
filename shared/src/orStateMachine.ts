import type { OperatingRoomStatus } from './schemas/operatingRoom.js';

/**
 * Who works an operating room (task 2.19). A nurse's kind follows their
 * department; a sterilization worker is a cleaner covering the operations
 * department.
 */
export const OR_ACTORS = ['ADMIN', 'DOCTOR', 'ER_NURSE', 'OR_NURSE', 'STERILIZER'] as const;
export type OrActor = (typeof OR_ACTORS)[number];

type Transition = {
  /** Who may make this move. */
  by: readonly OrActor[];
  /**
   * Made only by creating or cancelling a booking (2.20, 2.21), never by
   * pressing a room button, so a room is never booked without a booking.
   */
  viaBooking?: true;
};

/**
 * The cycle from the project report, plus maintenance:
 * available → booked (ER nurse or doctor) → preparing (OR nurse) → in surgery
 * (OR nurse) → awaiting sterilization (OR nurse ends it) → sterilizing
 * (sterilization worker) → available (sterilization worker). The admin takes
 * an available room out of service and back. A cancelled booking frees the
 * room.
 */
export const OR_TRANSITIONS: Partial<
  Record<OperatingRoomStatus, Partial<Record<OperatingRoomStatus, Transition>>>
> = {
  AVAILABLE: {
    BOOKED: { by: ['ER_NURSE', 'DOCTOR'], viaBooking: true },
    OUT_OF_SERVICE: { by: ['ADMIN'] },
  },
  BOOKED: {
    PREPARING: { by: ['OR_NURSE'] },
    AVAILABLE: { by: ['ER_NURSE', 'DOCTOR', 'ADMIN'], viaBooking: true },
  },
  PREPARING: {
    IN_SURGERY: { by: ['OR_NURSE'] },
  },
  IN_SURGERY: {
    AWAITING_STERILIZATION: { by: ['OR_NURSE'] },
  },
  AWAITING_STERILIZATION: {
    STERILIZING: { by: ['STERILIZER'] },
  },
  STERILIZING: {
    AVAILABLE: { by: ['STERILIZER'] },
  },
  OUT_OF_SERVICE: {
    AVAILABLE: { by: ['ADMIN'] },
  },
};

export type TransitionCheck =
  | { ok: true }
  /** No such move from this state (the room is not where the move starts). */
  | { ok: false; reason: 'INVALID_TRANSITION' }
  /** The move exists, but none of these roles may make it. */
  | { ok: false; reason: 'NOT_ALLOWED' }
  /** The move belongs to a booking, not to a room button. */
  | { ok: false; reason: 'VIA_BOOKING' };

/** Whether someone acting as `actors` may move a room from `from` to `to` by hand. */
export function checkTransition(
  from: OperatingRoomStatus,
  to: OperatingRoomStatus,
  actors: readonly OrActor[],
  { viaBooking = false } = {},
): TransitionCheck {
  const transition = OR_TRANSITIONS[from]?.[to];
  if (!transition) return { ok: false, reason: 'INVALID_TRANSITION' };
  if (!transition.by.some((actor) => actors.includes(actor))) {
    return { ok: false, reason: 'NOT_ALLOWED' };
  }
  if (transition.viaBooking && !viaBooking) return { ok: false, reason: 'VIA_BOOKING' };
  return { ok: true };
}

/** The moves these people can make from a state by hand: the buttons to show. */
export function nextStatuses(from: OperatingRoomStatus, actors: readonly OrActor[]) {
  return Object.entries(OR_TRANSITIONS[from] ?? {})
    .filter(
      ([, transition]) => !transition.viaBooking && transition.by.some((a) => actors.includes(a)),
    )
    .map(([to]) => to as OperatingRoomStatus);
}
