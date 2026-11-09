import { z } from 'zod';
import { id, optionalText, requiredText } from './common.js';

/** POST /doctors/me/patients/:id/consultations (task 3.12): ask a colleague about my patient. */
export const createConsultationSchema = z.object({
  consultantId: id(),
  question: requiredText(1000),
});

export type CreateConsultationInput = z.input<typeof createConsultationSchema>;
export type CreateConsultationData = z.output<typeof createConsultationSchema>;

/**
 * POST /doctors/me/consultations/:id/reply (task 3.14): the consultant's answer,
 * kept in the patient's file as a report.
 */
export const consultationReplySchema = z.object({
  reply: requiredText(2000),
  diagnosis: optionalText(300),
});

export type ConsultationReplyInput = z.input<typeof consultationReplySchema>;
export type ConsultationReplyData = z.output<typeof consultationReplySchema>;
