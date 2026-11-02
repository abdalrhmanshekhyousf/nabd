import type { OperatingRoomStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';

export type OperatingRoom = {
  id: string;
  name: string;
  status: OperatingRoomStatus;
  statusChangedAt: string;
};

/** One colour per operating room state, shared with the live board (task 2.26). */
export const OR_TONE: Record<OperatingRoomStatus, StatusTone> = {
  AVAILABLE: 'success',
  BOOKED: 'info',
  PREPARING: 'info',
  IN_SURGERY: 'danger',
  AWAITING_STERILIZATION: 'warning',
  STERILIZING: 'warning',
  OUT_OF_SERVICE: 'neutral',
};

/** The states where surgery is happening right now pulse. */
export const OR_PULSE: ReadonlySet<OperatingRoomStatus> = new Set(['IN_SURGERY']);
