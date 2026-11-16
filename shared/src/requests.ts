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

type DepartmentRef = { id: string; name: string; code: DepartmentCode | null };

/** Where I stand for my department's requests (task 4.6). */
export type DepartmentRequestContext = {
  department: DepartmentRef | null;
  head: DepartmentHead | null;
  isHead: boolean;
};

/** A purchase request with its items (tasks 4.6, 4.7). Money as numbers. */
export type PurchaseView = {
  id: string;
  department: DepartmentRef;
  requestedByName: string | null;
  note: string | null;
  totalCost: number;
  status: RequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  items: {
    id: string;
    inventoryItemId: string | null;
    name: string;
    unit: string | null;
    quantity: number;
    unitCost: number;
  }[];
};

/** A repair request (user addition). */
export type RepairView = {
  id: string;
  department: DepartmentRef;
  requestedByName: string | null;
  equipment: string;
  description: string;
  urgency: RepairUrgency;
  status: RequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

/** A stock item below its minimum, to add to a purchase request in one tap. */
export type ShortItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
};

/** Matches the ComplaintStatus enum (tasks 4.8, 4.9). */
export const COMPLAINT_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** A complaint as its author and the admin see it. */
export type ComplaintView = {
  id: string;
  subject: string;
  body: string;
  status: ComplaintStatus;
  reply: string | null;
  repliedAt: string | null;
  repliedByName: string | null;
  createdAt: string;
  author: { id: string; fullName: string };
  department: DepartmentRef | null;
};

/** Matches the MeetingStatus enum (task 4.10). */
export const MEETING_STATUSES = ['REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** A meeting the admin called with a doctor. */
export type MeetingView = {
  id: string;
  startsAt: string;
  topic: string;
  status: MeetingStatus;
  response: string | null;
  createdAt: string;
  doctor: { id: string; fullName: string };
  calledBy: { id: string; fullName: string } | null;
};
