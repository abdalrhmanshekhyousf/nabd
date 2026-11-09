/** A consultation waits for its answer, or was withdrawn (tasks 3.12–3.14). Matches the Prisma enum. */
export const CONSULTATION_STATUSES = ['PENDING', 'ANSWERED', 'CANCELLED'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

/** A consultation as both doctors see it, with the patient it is about. */
export type ConsultationView = {
  id: string;
  status: ConsultationStatus;
  question: string;
  reply: string | null;
  requesterId: string | null;
  requesterName: string;
  consultantId: string | null;
  consultantName: string;
  createdAt: string;
  answeredAt: string | null;
  patient: {
    patientId: string;
    fullName: string | null;
    isAnonymous: boolean;
    gender: 'MALE' | 'FEMALE' | null;
    dateOfBirth: string | null;
  };
};
