import type { PatientSummary } from '@nabd/shared';
import type { TFunction } from 'i18next';
import { ageFrom } from '@/lib/age';

export type Who = Pick<PatientSummary, 'fullName' | 'isAnonymous' | 'gender' | 'dateOfBirth'>;

/** The patient's name, or "unidentified patient" for anonymous ER arrivals. */
export function patientName(patient: Who, t: TFunction) {
  return patient.isAnonymous || !patient.fullName ? t('patients.anonymous') : patient.fullName;
}

/** "45 years · Male", leaving out whatever is unknown. */
export function patientFacts(patient: Who, t: TFunction) {
  const age = ageFrom(patient.dateOfBirth);
  return [
    age !== null ? t('patients.age', { count: age }) : null,
    patient.gender ? t(`patients.${patient.gender}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
