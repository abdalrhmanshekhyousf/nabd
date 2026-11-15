import type { Role } from './roles.js';
import type { DepartmentCode } from './schemas/department.js';

/** Matches the RequestStatus enum (tasks 4.4–4.7). */
export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Matches the RepairUrgency enum (department heads, user addition). */
export const REPAIR_URGENCIES = ['LOW', 'NORMAL', 'URGENT'] as const;
export type RepairUrgency = (typeof REPAIR_URGENCIES)[number];

/**
 * Who may head a department (user addition): one of its own pharmacists, lab
 * technicians or radiologists for those departments; a doctor of it otherwise.
 */
export function headRoleFor(code: DepartmentCode | null): Role {
  if (code === 'PHARMACY') return 'PHARMACIST';
  if (code === 'LABORATORY') return 'LAB_TECHNICIAN';
  if (code === 'RADIOLOGY') return 'RADIOLOGIST';
  return 'DOCTOR';
}

/** A department's head as lists show it. */
export type DepartmentHead = { id: string; fullName: string; role: Role };

/** A leave request as its requester and the admin see it (tasks 4.5, 4.7). */
export type LeaveView = {
  id: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: RequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
  requester: {
    id: string;
    fullName: string;
    role: Role;
    department: { id: string; name: string; code: DepartmentCode | null } | null;
  };
};
