import { z } from 'zod';
import { id, optionalText } from './common.js';

/**
 * POST /ward/admissions (task 3.16): a patient into an empty or reserved bed,
 * either one the ER transferred (visitId) or one found by name (patientId).
 */
export const admitSchema = z
  .object({
    bedId: id(),
    visitId: id().nullable().default(null),
    patientId: id().nullable().default(null),
    notes: optionalText(500),
  })
  .refine(({ visitId, patientId }) => (visitId === null) !== (patientId === null), {
    message: 'validation.required',
    path: ['patientId'],
  });

/** POST /ward/stays/:id/move: to another free bed of the department. */
export const moveStaySchema = z.object({ bedId: id() });

/** POST /ward/stays/:id/discharge: the patient leaves the bed. */
export const dischargeStaySchema = z.object({ notes: optionalText(500) });

/** The changes a nurse makes by hand: hold a bed for someone, or free it. */
export const WARD_BED_STATUSES = ['RESERVED', 'EMPTY'] as const;

/** POST /ward/beds/:id/status. */
export const wardBedStatusSchema = z.object({
  to: z.enum(WARD_BED_STATUSES, 'validation.required'),
  reason: optionalText(200),
});

export type AdmitInput = z.input<typeof admitSchema>;
export type AdmitData = z.output<typeof admitSchema>;
export type DischargeStayData = z.output<typeof dischargeStaySchema>;
export type WardBedStatusData = z.output<typeof wardBedStatusSchema>;
