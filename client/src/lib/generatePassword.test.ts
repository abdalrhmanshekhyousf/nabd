import { createStaffSchema } from '@nabd/shared';
import { describe, expect, it } from 'vitest';
import { generatePassword } from './generatePassword';

describe('generatePassword', () => {
  it('always passes the server password rules, and differs each time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[a-zA-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[l1O0I]/);
      const check = createStaffSchema.safeParse({
        fullName: 'x',
        phone: null,
        role: 'ACCOUNTANT',
        departmentId: null,
        specialty: null,
        radiologyModality: null,
        salary: 0,
        email: 'a@b.co',
        password,
      });
      expect(check.success).toBe(true);
      seen.add(password);
    }
    expect(seen.size).toBe(500);
  });
});
