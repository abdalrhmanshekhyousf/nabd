import type { PrescriptionView } from './medicalRecord.js';

/** A stock item that may fill a prescribed medicine (task 3.10). */
export type StockMatch = { id: string; name: string; unit: string; quantity: number };

/** A prescription on the pharmacy's board: whose, their allergies, and stock for each medicine. */
export type PharmacyPrescription = Omit<PrescriptionView, 'items'> & {
  patient: {
    id: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: 'MALE' | 'FEMALE' | null;
    dateOfBirth: string | null;
  };
  allergies: string | null;
  items: (PrescriptionView['items'][number] & { matches: StockMatch[] })[];
};
