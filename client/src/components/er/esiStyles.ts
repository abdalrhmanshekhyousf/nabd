import type { EsiLevel } from '@nabd/shared';

// The report's ESI colours, shared by the triage form, the waiting list (2.15)
// and the doctor's calls: red, orange, yellow, green, blue.
export const ESI_BG: Record<EsiLevel, string> = {
  1: 'bg-esi-1 text-white',
  2: 'bg-esi-2 text-white',
  3: 'bg-esi-3 text-ink',
  4: 'bg-esi-4 text-white',
  5: 'bg-esi-5 text-white',
};

export const ESI_BORDER: Record<EsiLevel, string> = {
  1: 'border-esi-1',
  2: 'border-esi-2',
  3: 'border-esi-3',
  4: 'border-esi-4',
  5: 'border-esi-5',
};
