import type { Role } from './session';

/** Each role's own area; its dashboard lives at this path (task 1.19). */
export const ROLE_HOME: Record<Role, string> = {
  ADMIN: '/admin',
  DOCTOR: '/doctor',
  NURSE: '/nurse',
  PHARMACIST: '/pharmacy',
  LAB_TECHNICIAN: '/lab',
  RADIOLOGIST: '/radiology',
  CLEANER: '/cleaning',
  RECEPTIONIST: '/reception',
  ACCOUNTANT: '/accounting',
  PATIENT: '/patient',
};

/** Whether `path` is inside the area of `role` (used to honour "go back to where you were"). */
export function canVisit(path: string, role: Role) {
  const home = ROLE_HOME[role];
  return path === home || path.startsWith(`${home}/`);
}
