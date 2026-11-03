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
};
