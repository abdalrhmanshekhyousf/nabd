import { describe, expect, it } from 'vitest';
import {
  bedServiceSchema,
  createBedSchema,
  createRoomSchema,
  departmentSchema,
  updateRoomSchema,
  hospitalInfoSchema,
  loginSchema,
  operatingRoomSchema,
  operatingRoomServiceSchema,
  preferencesSchema,
  registerHospitalFormSchema,
  registerHospitalSchema,
  VALIDATION_KEYS,
} from './index.js';

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

describe('registerHospitalSchema', () => {
  const valid = {
    hospital: { name: ' مستشفى الأمل ', address: 'حلب', phone: '+963 21 123 4567', email: '' },
    admin: { fullName: 'سارة', email: 'Sara@Amal.Org', password: 'Strong123' },
  };

  it('accepts a complete registration and normalizes it', () => {
    const parsed = registerHospitalSchema.parse(valid);
    expect(parsed.hospital.name).toBe('مستشفى الأمل');
    expect(parsed.hospital.email).toBeNull();
    expect(parsed.admin.email).toBe('sara@amal.org');
  });

  it('requires a strong enough password', () => {
    const withPassword = (password: string) =>
      messages(registerHospitalSchema.safeParse({ ...valid, admin: { ...valid.admin, password } }));
    expect(withPassword('short1')).toEqual(['validation.passwordTooShort']);
    expect(withPassword('onlyletters')).toEqual(['validation.passwordWeak']);
    expect(withPassword('12345678')).toEqual(['validation.passwordWeak']);
    expect(withPassword('كلمةسر2026')).toEqual([]);
  });

  it('checks the phone and the optional email', () => {
    const hospital = (changes: object) =>
      messages(
        registerHospitalSchema.safeParse({ ...valid, hospital: { ...valid.hospital, ...changes } }),
      );
    expect(hospital({ phone: 'call me' })).toEqual(['validation.phoneInvalid']);
    expect(hospital({ email: 'not-an-email' })).toEqual(['validation.emailInvalid']);
    expect(hospital({ email: 'Info@Amal.Org' })).toEqual([]);
  });

  it('the form also checks that both passwords match', () => {
    const form = (confirmPassword: string) =>
      registerHospitalFormSchema.safeParse({
        ...valid,
        admin: { ...valid.admin, confirmPassword },
      });
    expect(form('Strong123').success).toBe(true);
    expect(messages(form('Strong124'))).toEqual(['validation.passwordMismatch']);
  });
});

// The client validates with a schema, then sends the parsed result; the server
// validates that result with the same schema. So every schema must accept its own
// output (an empty optional email becomes null, and null must then be valid).
describe('client output is valid server input', () => {
  const samples = [
    [loginSchema, { email: ' A@B.co ', password: 'x' }],
    [preferencesSchema, { theme: 'DARK' }],
    [
      registerHospitalSchema,
      {
        hospital: { name: 'x', address: 'y', phone: '0991234567', email: '' },
        admin: { fullName: 'z', email: 'Z@Y.co', password: 'Strong1234' },
      },
    ],
    [hospitalInfoSchema, { name: 'x', address: 'y', phone: '0991234567', email: '' }],
    [departmentSchema, { name: '  الطوارئ  ' }],
    [
      createRoomSchema,
      {
        departmentId: '0199a3d2-6c55-7000-8000-000000000001',
        number: ' 101 ',
        floor: null,
        bedCount: 2,
      },
    ],
    [updateRoomSchema, { number: 'A-2', floor: 3 }],
    [createBedSchema, {}],
    [bedServiceSchema, { outOfService: true }],
    [operatingRoomSchema, { name: ' غرفة العمليات 1 ' }],
    [operatingRoomServiceSchema, { outOfService: false }],
    [hospitalInfoSchema, { name: 'x', address: 'y', phone: '0991234567', email: 'I@X.co' }],
  ] as const;

  it.each(samples.map(([schema, input], index) => [index, schema, input] as const))(
    'sample %i survives a second parse unchanged',
    (_index, schema, input) => {
      const once = schema.parse(input);
      expect(schema.parse(once)).toEqual(once);
    },
  );
});

describe('createRoomSchema', () => {
  const base = { departmentId: '0199a3d2-6c55-7000-8000-000000000001', number: '101', floor: 1 };
  it('limits the number of beds and checks the floor', () => {
    expect(createRoomSchema.safeParse({ ...base, bedCount: 0 }).success).toBe(true);
    expect(messages(createRoomSchema.safeParse({ ...base, bedCount: 21 }))).toEqual([
      'validation.tooMany',
    ]);
    expect(messages(createRoomSchema.safeParse({ ...base, bedCount: 2, floor: 1.5 }))).toEqual([
      'validation.invalid',
    ]);
  });
});
