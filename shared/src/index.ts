// @nabd/shared: one definition of every input rule and shared constant, used by
// the client forms and the server routes alike.
export * from './errors.js';
export * from './notifications.js';
export * from './medicalRecord.js';
export * from './triage.js';
export * from './operations.js';
export * from './orStateMachine.js';
export * from './inventory.js';
export * from './lab.js';
export * from './imaging.js';
export * from './roles.js';
export * from './schemas/auth.js';
export * from './schemas/common.js';
export * from './schemas/department.js';
export * from './schemas/doctor.js';
export * from './schemas/er.js';
export * from './schemas/booking.js';
export * from './schemas/cleaning.js';
export * from './schemas/inventory.js';
export * from './schemas/lab.js';
export * from './schemas/hospital.js';
export * from './schemas/me.js';
export * from './schemas/medicalRecord.js';
export * from './schemas/operatingRoom.js';
export * from './schemas/room.js';
export * from './schemas/staff.js';
export * from './schemas/patient.js';
export * from './uploads.js';

/** Translation keys used as validation messages (client: validation.*). */
export const VALIDATION_KEYS = [
  'validation.required',
  'validation.invalid',
  'validation.tooLong',
  'validation.emailRequired',
  'validation.emailInvalid',
  'validation.passwordRequired',
  'validation.passwordTooShort',
  'validation.passwordWeak',
  'validation.passwordMismatch',
  'validation.dateInvalid',
  'validation.phoneInvalid',
  'validation.tooMany',
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];
