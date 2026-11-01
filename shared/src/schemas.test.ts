import { describe, expect, it } from 'vitest';
import { loginSchema, preferencesSchema, VALIDATION_KEYS } from './index.js';

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('loginSchema', () => {
  it('normalizes the email', () => {
    const parsed = loginSchema.parse({ email: '  Admin@Nabd.Demo ', password: 'x' });
    expect(parsed.email).toBe('admin@nabd.demo');
  });

  it('reports missing and malformed fields with translation keys', () => {
    expect(messages(loginSchema.safeParse({ email: '', password: '' }))).toEqual([
      'validation.emailRequired',
      'validation.passwordRequired',
    ]);
    expect(messages(loginSchema.safeParse({ email: 'nope', password: 'x' }))).toEqual([
      'validation.emailInvalid',
    ]);
  });

  it('accepts an optional hospital id, but only a valid one', () => {
    const hospitalId = '0199a3d2-6c55-7000-8000-000000000001';
    expect(loginSchema.parse({ email: 'a@b.co', password: 'x', hospitalId }).hospitalId).toBe(
      hospitalId,
    );
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', hospitalId: '1' }).success).toBe(
      false,
    );
  });
});

describe('preferencesSchema', () => {
  it('accepts language and/or theme', () => {
    expect(preferencesSchema.parse({ theme: 'DARK' })).toEqual({ theme: 'DARK' });
    expect(preferencesSchema.parse({ language: 'EN', theme: 'LIGHT' })).toEqual({
      language: 'EN',
      theme: 'LIGHT',
    });
  });

  it('refuses empty bodies, unknown fields and unknown values', () => {
    for (const body of [{}, { role: 'ADMIN' }, { theme: 'PURPLE' }]) {
      expect(preferencesSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('messages', () => {
  it('only uses known translation keys', () => {
    const results = [
      loginSchema.safeParse({ email: '', password: '' }),
      loginSchema.safeParse({ email: 'x', password: 'x'.repeat(300), hospitalId: 'bad' }),
      preferencesSchema.safeParse({}),
    ];
    for (const message of results.flatMap(messages)) {
      expect(VALIDATION_KEYS).toContain(message);
    }
  });
});
