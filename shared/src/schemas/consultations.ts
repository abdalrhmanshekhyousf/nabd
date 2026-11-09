import { z } from 'zod';
import { id, requiredText } from './common.js';

/** POST /doctors/me/patients/:id/consultations (task 3.12): ask a colleague about my patient. */
export const createConsultationSchema = z.object({
  consultantId: id(),
  question: requiredText(1000),
});

export type CreateConsultationInput = z.input<typeof createConsultationSchema>;
export type CreateConsultationData = z.output<typeof createConsultationSchema>;
