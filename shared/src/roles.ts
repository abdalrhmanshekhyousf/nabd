// The ten kinds of users, matching the Role enum of the database schema.
export const ROLES = [
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'CLEANER',
  'RECEPTIONIST',
  'ACCOUNTANT',
  'PATIENT',
] as const;

export type Role = (typeof ROLES)[number];
