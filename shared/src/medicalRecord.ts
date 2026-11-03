/**
 * A prescription waits for the pharmacist, then is dispensed or cancelled
 * (tasks 2.6, 3.10). Matches the PrescriptionStatus enum.
 */
export const PRESCRIPTION_STATUSES = ['PENDING', 'DISPENSED', 'CANCELLED'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

/** A row of the doctor's patient list (task 2.7). Dates are YYYY-MM-DD, times ISO. */
export type PatientSummary = {
  patientId: string;
  fullName: string | null;
  isAnonymous: boolean;
  gender: 'MALE' | 'FEMALE' | null;
  dateOfBirth: string | null;
  phone: string | null;
  reportCount: number;
  prescriptionCount: number;
  lastReportAt: string | null;
};

export type PrescriptionView = {
  id: string;
  doctorName: string;
  status: PrescriptionStatus;
  notes: string | null;
  createdAt: string;
  dispensedAt: string | null;
  items: {
    id: string;
    drugName: string;
    dose: string;
    frequency: string;
    durationDays: number | null;
    instructions: string | null;
  }[];
};

export type DoctorReportView = {
  id: string;
  doctorName: string;
  title: string;
  diagnosis: string | null;
  content: string;
  createdAt: string;
};

/** A patient's whole file as the treating doctor reads it (task 2.7). */
export type PatientFile = {
  patient: Omit<PatientSummary, 'reportCount' | 'prescriptionCount' | 'lastReportAt'> & {
    bloodType: string | null;
    nationalId: string | null;
    address: string | null;
  };
  record: {
    id: string;
    doctorName: string | null;
    allergies: string | null;
    chronicConditions: string | null;
    notes: string | null;
  };
  reports: DoctorReportView[];
  prescriptions: PrescriptionView[];
};
