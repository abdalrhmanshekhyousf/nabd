import type { DoctorStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';

// One colour per doctor status, shared by the status button, the staff list
// and the ER doctor picker (2.16): green available, orange busy, grey on leave.
export const DOCTOR_STATUS_TONE: Record<DoctorStatus, StatusTone> = {
  AVAILABLE: 'success',
  BUSY: 'warning',
  ON_LEAVE: 'neutral',
};

export const DOCTOR_STATUS_DOT: Record<DoctorStatus, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  ON_LEAVE: 'bg-muted',
};
