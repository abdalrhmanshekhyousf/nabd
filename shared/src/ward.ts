import type { BedStatus } from './schemas/room.js';

type WardPatient = {
  patientId: string;
  fullName: string | null;
  isAnonymous: boolean;
  gender: 'MALE' | 'FEMALE' | null;
  dateOfBirth: string | null;
};

/** A patient's stay in a bed (task 3.16). */
export type WardStay = {
  id: string;
  patient: WardPatient;
  notes: string | null;
  admittedAt: string;
  admittedByName: string;
  /** The ER visit it came from, when it did. */
  fromEr: boolean;
};

export type WardBed = {
  id: string;
  label: string;
  status: BedStatus;
  statusChangedAt: string;
  stay: WardStay | null;
};

export type WardRoom = { id: string; number: string; floor: number | null; beds: WardBed[] };

/** A patient the ER transferred here who has no bed yet. */
export type IncomingPatient = {
  visitId: string;
  patient: WardPatient;
  level: number | null;
  chiefComplaint: string | null;
  closingNote: string | null;
  transferredAt: string;
};

/** The ward nurse's board: the department's rooms and beds, and who waits for a bed. */
export type WardBoard = {
  department: { id: string; name: string; code: string | null };
  rooms: WardRoom[];
  incoming: IncomingPatient[];
};

/** A patient found to admit (not in a bed already). */
export type AdmissionCandidate = WardPatient & { phone: string | null };
