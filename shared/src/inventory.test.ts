import { describe, expect, it } from 'vitest';
import { INVENTORY_CATEGORY_OF_ROLE, isLowStock } from './inventory.js';

describe('inventory (task 3.1)', () => {
  it('is low at or under the minimum', () => {
    expect(isLowStock({ quantity: 5, minQuantity: 10 })).toBe(true);
    expect(isLowStock({ quantity: 10, minQuantity: 10 })).toBe(true);
    expect(isLowStock({ quantity: 11, minQuantity: 10 })).toBe(false);
    expect(isLowStock({ quantity: 0, minQuantity: 0 })).toBe(true);
  });

  it('each specialist looks after one kind of stock', () => {
    expect(INVENTORY_CATEGORY_OF_ROLE).toEqual({
      PHARMACIST: 'DRUG',
      LAB_TECHNICIAN: 'LAB',
      RADIOLOGIST: 'RADIOLOGY',
    });
    expect(INVENTORY_CATEGORY_OF_ROLE.NURSE).toBeUndefined();
  });
});
