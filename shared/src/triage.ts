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
};

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
