import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Secret@123');

    expect(hash).not.toBe('Secret@123');
    expect(await verifyPassword('Secret@123', hash)).toBe(true);
    expect(await verifyPassword('secret@123', hash)).toBe(false);
  });
});
