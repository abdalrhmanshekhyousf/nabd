import { z } from 'zod';
import { id, optionalText, requiredText } from './common.js';

/**
 * POST /bookings: a doctor books an operating room for one of their patients
 * (task 2.20). The start must be in the future; the server refuses overlaps.
 */
export const createBookingSchema = z.object({
  operatingRoomId: id(),
  patientId: id(),
  procedure: requiredText(160),
  startsAt: z.iso
    .datetime({ offset: true, message: 'validation.invalid' })
    .refine((value) => new Date(value).getTime() > Date.now() - 60_000, 'validation.dateInvalid'),
  durationMinutes: z
    .number('validation.required')
    .int('validation.invalid')
    .min(15, 'validation.invalid')
    .max(720, 'validation.tooMany'),
  notes: optionalText(300),
});

/** GET /bookings?from=…&to=…: the schedule between two times. */
export const bookingRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;
export type CreateBookingData = z.output<typeof createBookingSchema>;
