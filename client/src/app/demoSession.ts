// TEMPORARY: the signed-in user and their hospital, matching the seed data
// (server/prisma/seed.ts). Replaced by the real session from login in task 1.18.
export type Role =
  | 'ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'PHARMACIST'
  | 'LAB_TECHNICIAN'
  | 'RADIOLOGIST'
  | 'CLEANER'
  | 'RECEPTIONIST'
  | 'ACCOUNTANT'
  | 'PATIENT';

export type SessionUser = { fullName: string; role: Role };
export type SessionHospital = { name: string; logoUrl: string | null };

export const demoSession: { user: SessionUser; hospital: SessionHospital } = {
  user: { fullName: 'مدير المستشفى', role: 'ADMIN' },
  hospital: { name: 'مستشفى نبض التجريبي', logoUrl: null },
};
