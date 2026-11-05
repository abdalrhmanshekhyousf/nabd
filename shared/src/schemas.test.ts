import { describe, expect, it } from 'vitest';
import {
  bedServiceSchema,
  createStaffSchema,
  staffFilterSchema,
  assignCleanerSchema,
  assignNurseSchema,
  registerPatientSchema,
  registerPatientFormSchema,
  hospitalSearchSchema,
  doctorStatusSchema,
  createReportSchema,
  createPrescriptionSchema,
  quickRegistrationSchema,
  triageSchema,
  overrideLevelSchema,
  transferSchema,
  dischargeSchema,
  erStatusSchema,
  createBookingSchema,
  emergencyBookingSchema,
  rescheduleBookingSchema,
  overlaps,
  overrideReasonMissing,
  isAbnormal,
  updateStaffSchema,
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
    [
      updateStaffSchema,
      {
        fullName: 'لينا',
        phone: null,
        role: 'NURSE',
        departmentId: '0199a3d2-6c55-7000-8000-000000000001',
        specialty: null,
        radiologyModality: null,
        salary: 900000,
        email: 'Lina@Amal.Org',
        password: '',
        isActive: true,
      },
    ],
    [
      createStaffSchema,
      {
        fullName: ' د. ريم ',
        phone: '',
        role: 'DOCTOR',
        departmentId: '0199a3d2-6c55-7000-8000-000000000001',
        specialty: 'قلبية',
        radiologyModality: 'XRAY',
        salary: 1500000,
        email: 'Reem@Amal.Org',
        password: 'Strong1234',
      },
    ],
    [
      registerPatientSchema,
      {
        hospitalId: '0199a3d2-6c55-7000-8000-000000000001',
        fullName: ' سارة ',
        phone: '0991 234 567',
        gender: 'FEMALE',
        dateOfBirth: '',
        email: 'Sara@Mail.Com',
        password: 'Strong1234',
      },
    ],
    [hospitalSearchSchema, { search: ' دار ' }],
    [doctorStatusSchema, { status: 'BUSY' }],
    [overrideLevelSchema, { level: 2, reason: ' شكله تعبان ' }],
    [transferSchema, { departmentId: '0199a3d2-6c55-7000-8000-000000000001', note: '' }],
    [dischargeSchema, { note: ' راحة 3 أيام ' }],
    [erStatusSchema, { status: 'IN_TREATMENT' }],
    [
      triageSchema,
      {
        chiefComplaint: 'ألم بالصدر',
        breathing: true,
        consciousness: 'ALERT',
        pulse: 118,
        systolic: 90,
        diastolic: 60,
        respiratoryRate: 24,
        oxygenSaturation: 91,
        temperature: 37.8,
        painScore: 8,
        expectedExams: 2,
      },
    ],
    [
      quickRegistrationSchema,
      { anonymous: true, gender: null, chiefComplaint: ' نزيف ', arrivalNote: '' },
    ],
    [
      quickRegistrationSchema,
      {
        anonymous: false,
        fullName: 'سارة',
        phone: '',
        dateOfBirth: '',
        nationalId: ' 0101 ',
        gender: 'FEMALE',
        chiefComplaint: 'ألم بطن',
        arrivalNote: null,
      },
    ],
    [createReportSchema, { title: ' مراجعة ', diagnosis: '', content: 'مستقر' }],
    [
      createPrescriptionSchema,
      {
        items: [
          {
            drugName: 'أملوديبين',
            dose: '5 ملغ',
            frequency: 'مرة باليوم',
            durationDays: 30,
            instructions: '',
          },
        ],
        notes: null,
      },
    ],
    [assignNurseSchema, { departmentId: '0199a3d2-6c55-7000-8000-000000000001' }],
    [
      assignCleanerSchema,
      {
        departmentIds: [
          '0199a3d2-6c55-7000-8000-000000000001',
          '0199a3d2-6c55-7000-8000-000000000001',
        ],
      },
    ],
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

describe('createStaffSchema', () => {
  const base = {
    fullName: 'x',
    phone: null,
    departmentId: null,
    specialty: null,
    radiologyModality: null,
    salary: 0,
    email: 'a@b.co',
    password: 'Strong1234',
  };
  const issues = (data: object) => {
    const result = createStaffSchema.safeParse({ ...base, ...data });
    return result.error?.issues.map((i) => `${i.path.join('.')}:${i.message}`) ?? [];
  };

  it('asks each role for what it needs', () => {
    expect(issues({ role: 'DOCTOR' })).toEqual([
      'departmentId:validation.required',
      'specialty:validation.required',
    ]);
    expect(issues({ role: 'NURSE' })).toEqual(['departmentId:validation.required']);
    expect(issues({ role: 'RADIOLOGIST' })).toEqual(['radiologyModality:validation.required']);
    expect(issues({ role: 'ACCOUNTANT' })).toEqual([]);
  });

  it('drops details that do not apply to the role', () => {
    const parsed = createStaffSchema.parse({
      ...base,
      role: 'CLEANER',
      specialty: 'x',
      radiologyModality: 'CT',
    });
    expect(parsed).toMatchObject({ specialty: null, radiologyModality: null });
  });

  it('refuses admin and patient roles', () => {
    expect(issues({ role: 'ADMIN' })).toEqual(['role:validation.required']);
    expect(issues({ role: 'PATIENT' })).toEqual(['role:validation.required']);
  });
});

describe('updateStaffSchema', () => {
  const base = {
    fullName: 'x',
    phone: null,
    role: 'ACCOUNTANT',
    departmentId: null,
    specialty: null,
    radiologyModality: null,
    salary: 0,
    email: 'a@b.co',
    isActive: true,
  };

  it('keeps the password when left empty and checks a new one', () => {
    expect(updateStaffSchema.parse({ ...base, password: '' }).password).toBeNull();
    expect(updateStaffSchema.parse({ ...base, password: null }).password).toBeNull();
    expect(updateStaffSchema.parse({ ...base, password: 'Strong1234' }).password).toBe(
      'Strong1234',
    );
    expect(updateStaffSchema.safeParse({ ...base, password: 'weak' }).success).toBe(false);
  });

  it('applies the same role rules as adding', () => {
    const result = updateStaffSchema.safeParse({ ...base, role: 'DOCTOR', password: '' });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['departmentId', 'specialty']);
  });
});

describe('staffFilterSchema', () => {
  it('accepts an empty filter and refuses unknown roles', () => {
    expect(staffFilterSchema.parse({})).toEqual({});
    expect(staffFilterSchema.parse({ search: '  لينا ' }).search).toBe('لينا');
    expect(staffFilterSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
  });
});

describe('cleaner and nurse assignments', () => {
  const A = '0199a3d2-6c55-7000-8000-000000000001';
  const B = '0199a3d2-6c55-7000-8000-000000000002';

  it('keeps each cleaner department once and allows none', () => {
    expect(assignCleanerSchema.parse({ departmentIds: [A, B, A] }).departmentIds).toEqual([A, B]);
    expect(assignCleanerSchema.parse({ departmentIds: [] }).departmentIds).toEqual([]);
    expect(assignCleanerSchema.safeParse({ departmentIds: ['x'] }).success).toBe(false);
  });

  it('needs a department for a nurse', () => {
    expect(messages(assignNurseSchema.safeParse({}))).not.toHaveLength(0);
    expect(assignNurseSchema.parse({ departmentId: A })).toEqual({ departmentId: A });
  });

  it('does not store a single department for a cleaner', () => {
    const cleaner = createStaffSchema.parse({
      fullName: 'أبو أحمد',
      phone: null,
      role: 'CLEANER',
      departmentId: A,
      specialty: null,
      radiologyModality: null,
      salary: 400000,
      email: 'abu@amal.org',
      password: 'Strong1234',
    });
    expect(cleaner.departmentId).toBeNull();
  });
});

describe('registerPatientSchema', () => {
  const patient = {
    hospitalId: '0199a3d2-6c55-7000-8000-000000000001',
    fullName: 'سارة',
    phone: '0991234567',
    gender: 'FEMALE',
    dateOfBirth: '1990-05-17',
    email: 'Sara@Mail.Com',
    password: 'Strong1234',
  };

  it('accepts a patient and normalizes the email', () => {
    const parsed = registerPatientSchema.parse(patient);
    expect(parsed).toMatchObject({ email: 'sara@mail.com', dateOfBirth: '1990-05-17' });
  });

  it('requires a hospital, a gender and a phone', () => {
    const result = registerPatientSchema.safeParse({
      ...patient,
      hospitalId: '',
      gender: '',
      phone: '',
    });
    expect([...new Set(result.error?.issues.map((issue) => issue.path[0]))].sort()).toEqual(
      ['gender', 'hospitalId', 'phone'].sort(),
    );
  });

  it('refuses a birth date in the future, too old or malformed', () => {
    for (const dateOfBirth of ['2999-01-01', '1850-01-01', '17/05/1990', '1990-13-45']) {
      expect(messages(registerPatientSchema.safeParse({ ...patient, dateOfBirth }))).toEqual([
        'validation.dateInvalid',
      ]);
    }
    expect(registerPatientSchema.parse({ ...patient, dateOfBirth: null }).dateOfBirth).toBeNull();
  });

  it('checks the password confirmation in the form', () => {
    const result = registerPatientFormSchema.safeParse({
      ...patient,
      confirmPassword: 'Other1234',
    });
    expect(messages(result)).toEqual(['validation.passwordMismatch']);
  });
});

describe('doctorStatusSchema', () => {
  it('accepts the three statuses only', () => {
    for (const status of ['AVAILABLE', 'BUSY', 'ON_LEAVE']) {
      expect(doctorStatusSchema.parse({ status })).toEqual({ status });
    }
    expect(messages(doctorStatusSchema.safeParse({ status: 'SLEEPING' }))).toEqual([
      'validation.required',
    ]);
  });
});

describe('report and prescription schemas', () => {
  it('needs a title and text for a report; the diagnosis is optional', () => {
    expect(
      createReportSchema.parse({ title: 'x', diagnosis: '  ', content: 'y' }).diagnosis,
    ).toBeNull();
    expect(
      messages(createReportSchema.safeParse({ title: '', diagnosis: null, content: '' })),
    ).toEqual(['validation.required', 'validation.required']);
  });

  it('needs at least one complete medicine', () => {
    expect(messages(createPrescriptionSchema.safeParse({ items: [], notes: null }))).toEqual([
      'validation.required',
    ]);
    const missingDose = createPrescriptionSchema.safeParse({
      items: [{ drugName: 'x', dose: '', frequency: 'y', durationDays: null, instructions: null }],
      notes: null,
    });
    expect(missingDose.error?.issues[0].path).toEqual(['items', 0, 'dose']);
    expect(
      createPrescriptionSchema.safeParse({
        items: [{ drugName: 'x', dose: 'y', frequency: 'z', durationDays: 0, instructions: null }],
        notes: null,
      }).success,
    ).toBe(false);
  });
});

describe('quickRegistrationSchema', () => {
  it('an unidentified arrival needs only the complaint', () => {
    expect(
      quickRegistrationSchema.parse({
        anonymous: true,
        gender: null,
        chiefComplaint: 'غياب وعي',
        arrivalNote: null,
      }),
    ).toEqual({ anonymous: true, gender: null, chiefComplaint: 'غياب وعي', arrivalNote: null });
    expect(
      messages(
        quickRegistrationSchema.safeParse({
          anonymous: true,
          gender: null,
          chiefComplaint: '',
          arrivalNote: null,
        }),
      ),
    ).toEqual(['validation.required']);
  });

  it('a known patient needs a name too', () => {
    const result = quickRegistrationSchema.safeParse({
      anonymous: false,
      fullName: ' ',
      phone: null,
      dateOfBirth: null,
      nationalId: null,
      gender: null,
      chiefComplaint: 'كسر',
      arrivalNote: null,
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['fullName']);
  });
});

describe('triageSchema', () => {
  const triage = {
    chiefComplaint: 'ألم بالصدر',
    breathing: true,
    consciousness: 'ALERT',
    pulse: 118,
    systolic: 90,
    diastolic: 60,
    respiratoryRate: 24,
    oxygenSaturation: 91,
    temperature: 37.8,
    painScore: 8,
    expectedExams: 2,
  };

  it('accepts a full assessment, and vitals that could not be measured', () => {
    expect(triageSchema.parse(triage)).toEqual(triage);
    expect(triageSchema.parse({ ...triage, pulse: null, temperature: null }).pulse).toBeNull();
  });

  it('refuses impossible or badly shaped values', () => {
    for (const change of [
      { pulse: 400 },
      { oxygenSaturation: 101 },
      { temperature: 37.85 },
      { painScore: 11 },
      { expectedExams: 3 },
      { consciousness: 'ASLEEP' },
    ]) {
      expect(triageSchema.safeParse({ ...triage, ...change }).success).toBe(false);
    }
  });

  it('knows which vital signs are outside the normal range', () => {
    expect(isAbnormal('pulse', 118)).toBe(true);
    expect(isAbnormal('pulse', 72)).toBe(false);
    expect(isAbnormal('oxygenSaturation', 91)).toBe(true);
    expect(isAbnormal('temperature', null)).toBe(false);
  });
});

describe('overrideLevelSchema', () => {
  it('takes a level 1 to 5 and an optional reason', () => {
    expect(overrideLevelSchema.parse({ level: 1, reason: '' })).toEqual({ level: 1, reason: null });
    expect(overrideLevelSchema.safeParse({ level: 6, reason: null }).success).toBe(false);
  });

  it('a reason is needed only when the level differs from the suggestion', () => {
    expect(overrideReasonMissing(2, 4, null)).toBe(true);
    expect(overrideReasonMissing(2, 4, '  ')).toBe(true);
    expect(overrideReasonMissing(2, 4, 'شكله تعبان')).toBe(false);
    expect(overrideReasonMissing(4, 4, null)).toBe(false);
  });
});

describe('ER status, transfer and discharge', () => {
  it('only waiting or in treatment can be set directly', () => {
    expect(erStatusSchema.safeParse({ status: 'IN_TREATMENT' }).success).toBe(true);
    expect(erStatusSchema.safeParse({ status: 'DISCHARGED' }).success).toBe(false);
  });

  it('a transfer needs a department; notes are optional', () => {
    expect(transferSchema.safeParse({ departmentId: '', note: null }).success).toBe(false);
    expect(dischargeSchema.parse({ note: '' })).toEqual({ note: null });
  });
});

describe('bookings', () => {
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const booking = {
    operatingRoomId: '0199a3d2-6c55-7000-8000-000000000001',
    patientId: '0199a3d2-6c55-7000-8000-000000000002',
    procedure: 'استئصال زائدة',
    startsAt: soon,
    durationMinutes: 90,
    notes: '',
  };

  it('takes a future start and a sensible length', () => {
    expect(createBookingSchema.parse(booking)).toMatchObject({ durationMinutes: 90, notes: null });
    expect(
      createBookingSchema.safeParse({ ...booking, startsAt: '2020-01-01T10:00:00Z' }).success,
    ).toBe(false);
    expect(createBookingSchema.safeParse({ ...booking, durationMinutes: 5 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...booking, startsAt: 'tomorrow' }).success).toBe(false);
  });

  it('an emergency booking names either the ER visit or my patient, not both', () => {
    const urgent = {
      operatingRoomId: booking.operatingRoomId,
      procedure: 'فتح بطن',
      durationMinutes: 120,
      notes: null,
    };
    const visitId = '0199a3d2-6c55-7000-8000-000000000003';
    expect(emergencyBookingSchema.parse({ ...urgent, visitId })).toMatchObject({
      visitId,
      patientId: null,
    });
    expect(
      emergencyBookingSchema.safeParse({ ...urgent, patientId: booking.patientId }).success,
    ).toBe(true);
    expect(emergencyBookingSchema.safeParse(urgent).success).toBe(false);
    expect(
      emergencyBookingSchema.safeParse({ ...urgent, visitId, patientId: booking.patientId })
        .success,
    ).toBe(false);
  });

  it('rescheduling takes a new future time', () => {
    const next = { operatingRoomId: booking.operatingRoomId, startsAt: soon, durationMinutes: 60 };
    expect(rescheduleBookingSchema.parse(next)).toEqual(next);
    expect(
      rescheduleBookingSchema.safeParse({ ...next, startsAt: '2020-01-01T10:00:00Z' }).success,
    ).toBe(false);
  });

  it('knows which slots overlap; touching ends do not', () => {
    const slot = { startsAt: '2026-11-05T10:00:00Z', endsAt: '2026-11-05T11:00:00Z' };
    expect(
      overlaps(slot, { startsAt: '2026-11-05T10:30:00Z', endsAt: '2026-11-05T12:00:00Z' }),
    ).toBe(true);
    expect(
      overlaps(slot, { startsAt: '2026-11-05T09:00:00Z', endsAt: '2026-11-05T13:00:00Z' }),
    ).toBe(true);
    expect(
      overlaps(slot, { startsAt: '2026-11-05T11:00:00Z', endsAt: '2026-11-05T12:00:00Z' }),
    ).toBe(false);
    expect(
      overlaps(slot, { startsAt: '2026-11-05T08:00:00Z', endsAt: '2026-11-05T10:00:00Z' }),
    ).toBe(false);
  });
});
