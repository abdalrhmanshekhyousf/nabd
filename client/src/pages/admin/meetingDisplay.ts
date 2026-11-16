import type { MeetingStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';

export const MEETING_TONE: Record<MeetingStatus, StatusTone> = {
  REQUESTED: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'neutral',
};
