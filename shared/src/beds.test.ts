import { describe, expect, it } from 'vitest';
import { BED_TRANSITIONS, canChangeBed } from './beds.js';
import { BED_STATUSES } from './schemas/room.js';

describe('bed states (task 3.15)', () => {
  it('covers every state, and every move leads to another state', () => {
    expect(Object.keys(BED_TRANSITIONS).sort()).toEqual([...BED_STATUSES].sort());
    for (const [from, targets] of Object.entries(BED_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  it('an occupied bed is cleaned before it is empty again', () => {
    expect(canChangeBed('OCCUPIED', 'CLEANING')).toBe(true);
    expect(canChangeBed('OCCUPIED', 'EMPTY')).toBe(false);
    expect(canChangeBed('CLEANING', 'EMPTY')).toBe(true);
    expect(canChangeBed('CLEANING', 'OCCUPIED')).toBe(false);
  });

  it('patients go into empty or reserved beds; only an empty bed leaves service', () => {
    expect(canChangeBed('EMPTY', 'OCCUPIED')).toBe(true);
    expect(canChangeBed('RESERVED', 'OCCUPIED')).toBe(true);
    expect(canChangeBed('OUT_OF_SERVICE', 'OCCUPIED')).toBe(false);
    expect(canChangeBed('OCCUPIED', 'OUT_OF_SERVICE')).toBe(false);
    expect(canChangeBed('EMPTY', 'OUT_OF_SERVICE')).toBe(true);
  });
});
