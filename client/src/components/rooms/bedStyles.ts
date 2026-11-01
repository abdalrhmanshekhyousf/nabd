import type { BedStatus } from '@nabd/shared';
import type { StatusTone } from '@/components/ui';

export type Bed = { id: string; label: string; status: BedStatus; statusChangedAt: string };
export type Room = {
  id: string;
  number: string;
  floor: number | null;
  departmentId: string;
  beds: Bed[];
};

/** One color per bed state, shared by the admin page and the bed map (task 3.18). */
export const BED_TONE: Record<BedStatus, StatusTone> = {
  EMPTY: 'success',
  RESERVED: 'info',
  OCCUPIED: 'danger',
  CLEANING: 'warning',
  OUT_OF_SERVICE: 'neutral',
};

export const BED_TILE_CLASSES: Record<BedStatus, string> = {
  EMPTY: 'border-success/30 bg-success/10 text-success',
  RESERVED: 'border-info/30 bg-info/10 text-info',
  OCCUPIED: 'border-danger/30 bg-danger/10 text-danger',
  CLEANING: 'border-warning/30 bg-warning/10 text-warning',
  OUT_OF_SERVICE: 'border-dashed border-input bg-surface-muted text-muted',
};
