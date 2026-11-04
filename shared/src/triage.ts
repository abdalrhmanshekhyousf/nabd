import type { DepartmentCode } from './schemas/department.js';

/** ESI triage levels: 1 is the most urgent (task 2.10). */
export const ESI_LEVELS = [1, 2, 3, 4, 5] as const;
export type EsiLevel = (typeof ESI_LEVELS)[number];

/** AVPU: alert, responds to voice, responds to pain, unresponsive. */
export const CONSCIOUSNESS_LEVELS = ['ALERT', 'VERBAL', 'PAIN', 'UNRESPONSIVE'] as const;
export type Consciousness = (typeof CONSCIOUSNESS_LEVELS)[number];

/** An ER case waits, is treated, then is transferred to a ward or discharged (2.17). */
export const TRIAGE_STATUSES = ['WAITING', 'IN_TREATMENT', 'TRANSFERRED', 'DISCHARGED'] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

/** A call to a doctor waits for their answer (2.9, 2.16). */
export const DOCTOR_CALL_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export type DoctorCallStatus = (typeof DOCTOR_CALL_STATUSES)[number];

/** How many tests or images are expected; 2 means "two or more" (ESI 3). */
export const EXPECTED_EXAMS = [0, 1, 2] as const;

/**
 * Normal adult ranges, inclusive. Outside them a vital sign is "abnormal":
 * the triage form flags it, and the ESI suggestion (2.13) counts it.
 */
export const VITAL_RANGES = {
  pulse: { min: 50, max: 100, unit: 'bpm' },
  systolic: { min: 90, max: 160, unit: 'mmHg' },
  diastolic: { min: 50, max: 100, unit: 'mmHg' },
  respiratoryRate: { min: 12, max: 20, unit: '/min' },
  oxygenSaturation: { min: 92, max: 100, unit: '%' },
  temperature: { min: 36, max: 38, unit: '°C' },
} as const;
export type VitalSign = keyof typeof VITAL_RANGES;

/** Whether a measured value is outside the normal range (unmeasured is not). */
export function isAbnormal(sign: VitalSign, value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  const { min, max } = VITAL_RANGES[sign];
  return value < min || value > max;
}

/** An emergency visit as the ER screens show it (tasks 2.12–2.17). */
export type ErVisit = {
  id: string;
  status: TriageStatus;
  arrivedAt: string;
  assessedAt: string | null;
  chiefComplaint: string | null;
  arrivalNote: string | null;
  patient: {
    id: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: 'MALE' | 'FEMALE' | null;
    dateOfBirth: string | null;
  };
  breathing: boolean | null;
  consciousness: Consciousness | null;
  pulse: number | null;
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  temperature: number | null;
  painScore: number | null;
  expectedExams: number | null;
  suggestedLevel: number | null;
  level: number | null;
  overrideReason: string | null;
  /** Why the suggested level, once assessed (task 2.13). */
  reasons: EsiReason[];
  /** The latest call to a doctor for this visit (task 2.16), if any. */
  call: DoctorCallView | null;
  /** Where the patient went and when, once transferred or discharged (2.17). */
  closedAt: string | null;
  closingNote: string | null;
  department: { id: string; name: string; code: DepartmentCode | null } | null;
};

/** A visit is closed once the patient is transferred or discharged. */
export function isClosed(status: TriageStatus) {
  return status === 'TRANSFERRED' || status === 'DISCHARGED';
}

export type DoctorCallView = {
  id: string;
  status: DoctorCallStatus;
  doctorId: string | null;
  doctorName: string | null;
  declineReason: string | null;
  createdAt: string;
  respondedAt: string | null;
};

/** A doctor the ER can call (task 2.16). */
export type DoctorOption = {
  id: string;
  fullName: string;
  specialty: string;
  status: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE';
  department: { id: string; name: string; code: DepartmentCode | null } | null;
};

/**
 * When the chosen doctor is busy or on leave: available doctors of the same
 * specialty (case and spaces ignored). The server and the picker use the same
 * rule, so the picker offers exactly what the server will accept.
 */
export function availableAlternatives(doctors: DoctorOption[], chosen: DoctorOption) {
  const specialty = chosen.specialty.trim().toLowerCase();
  return doctors.filter(
    (doctor) =>
      doctor.id !== chosen.id &&
      doctor.status === 'AVAILABLE' &&
      doctor.specialty.trim().toLowerCase() === specialty,
  );
}

/** Why a level was suggested, so the nurse sees the reasoning (task 2.13). */
export type EsiReason =
  | { code: 'NOT_BREATHING' }
  | { code: 'UNRESPONSIVE' }
  | { code: 'ALTERED_CONSCIOUSNESS' }
  | { code: 'ABNORMAL_VITALS'; signs: VitalSign[] }
  | { code: 'SEVERE_PAIN'; score: number }
  | { code: 'EXAMS'; count: number };

/** What the suggestion reads from the triage form; anything may still be missing. */
export type EsiInput = {
  breathing?: boolean | null;
  consciousness?: Consciousness | null;
  painScore?: number | null;
} & Partial<Record<VitalSign, number | null>> & { expectedExams?: number | null };

/** Above this pain score the case is level 2. */
export const SEVERE_PAIN_ABOVE = 7;

const SIGNS = Object.keys(VITAL_RANGES) as VitalSign[];

/**
 * Suggests an ESI level from the triage form (task 2.13), following the
 * project report, in this order:
 * 1. not breathing or unresponsive → 1;
 * 2. a danger sign → 2: altered consciousness (responds only to voice or
 *    pain), any measured vital sign outside the normal range, or pain above 7;
 * 3. otherwise by expected tests: two or more → 3, one → 4, none → 5.
 * Unmeasured values never count. Without the number of tests (form not
 * finished), it answers 3: the safer of the remaining levels.
 */
export function suggestEsiLevel(input: EsiInput): { level: EsiLevel; reasons: EsiReason[] } {
  const critical: EsiReason[] = [];
  if (input.breathing === false) critical.push({ code: 'NOT_BREATHING' });
  if (input.consciousness === 'UNRESPONSIVE') critical.push({ code: 'UNRESPONSIVE' });
  if (critical.length > 0) return { level: 1, reasons: critical };

  const danger: EsiReason[] = [];
  if (input.consciousness === 'VERBAL' || input.consciousness === 'PAIN') {
    danger.push({ code: 'ALTERED_CONSCIOUSNESS' });
  }
  const abnormal = SIGNS.filter((sign) => isAbnormal(sign, input[sign]));
  if (abnormal.length > 0) danger.push({ code: 'ABNORMAL_VITALS', signs: abnormal });
  const pain = input.painScore;
  if (typeof pain === 'number' && pain > SEVERE_PAIN_ABOVE) {
    danger.push({ code: 'SEVERE_PAIN', score: pain });
  }
  if (danger.length > 0) return { level: 2, reasons: danger };

  const exams = input.expectedExams;
  if (exams === null || exams === undefined) return { level: 3, reasons: [] };
  const level = exams >= 2 ? 3 : exams === 1 ? 4 : 5;
  return { level, reasons: [{ code: 'EXAMS', count: Math.min(exams, 2) }] };
}

/**
 * How long each level may wait before a doctor sees them, in minutes (the
 * usual ESI targets; the report: 1 immediately, 2 within minutes). Waiting
 * longer marks the card late on the waiting list (task 2.15).
 */
export const ESI_TARGET_MINUTES: Record<EsiLevel, number> = { 1: 0, 2: 10, 3: 30, 4: 60, 5: 120 };

/** Minutes since arrival, whole. */
export function minutesWaiting(arrivedAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(arrivedAt).getTime()) / 60_000));
}

/** Waiting longer than the level allows (level 1 is never "on time" while waiting). */
export function isOverdue(level: number | null, arrivedAt: string, now = Date.now()) {
  if (level === null || !(level in ESI_TARGET_MINUTES)) return false;
  const target = ESI_TARGET_MINUTES[level as EsiLevel];
  const waited = (now - new Date(arrivedAt).getTime()) / 60_000;
  return level === 1 ? waited >= 1 : waited > target;
}

/** A call as the doctor sees it on their calls page (task 2.9). */
export type DoctorCallItem = {
  id: string;
  status: DoctorCallStatus;
  createdAt: string;
  respondedAt: string | null;
  declineReason: string | null;
  calledBy: string | null;
  visit: {
    id: string;
    status: TriageStatus;
    level: number | null;
    chiefComplaint: string | null;
    arrivedAt: string;
    patient: ErVisit['patient'];
  };
};
