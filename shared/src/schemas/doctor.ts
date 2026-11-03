import { z } from 'zod';

/** A doctor's availability (task 2.5). Matches the DoctorStatus enum. */
export const DOCTOR_STATUSES = ['AVAILABLE', 'BUSY', 'ON_LEAVE'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

/** PATCH /doctors/me/status: the doctor sets their own status. */
export const doctorStatusSchema = z.object({
  status: z.enum(DOCTOR_STATUSES, 'validation.required'),
});

export type DoctorStatusInput = z.infer<typeof doctorStatusSchema>;
