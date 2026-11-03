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
