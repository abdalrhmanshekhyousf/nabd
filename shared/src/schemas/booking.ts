import { z } from 'zod';
import { id, optionalText, requiredText } from './common.js';

/**
 * POST /bookings: a doctor books an operating room for one of their patients
 * (task 2.20). The start must be in the future; the server refuses overlaps.
 */
const startsAt = z.iso
  .datetime({ offset: true, message: 'validation.invalid' })
  .refine((value) => new Date(value).getTime() > Date.now() - 60_000, 'validation.dateInvalid');
const durationMinutes = z
  .number('validation.required')
  .int('validation.invalid')
  .min(15, 'validation.invalid')
  .max(720, 'validation.tooMany');

export const createBookingSchema = z.object({
  operatingRoomId: id(),
  patientId: id(),
  procedure: requiredText(160),
  startsAt,
  durationMinutes,
  notes: optionalText(300),
});

/** PATCH /bookings/:id: a new time (or room) for my booking, e.g. after it was postponed (task 2.21). */
export const rescheduleBookingSchema = z.object({
  operatingRoomId: id(),
  startsAt,
  durationMinutes,
});

/**
 * POST /bookings/emergency (task 2.21): an operation that starts now. An ER
 * nurse books it from the patient's visit; a doctor for one of their patients.
 * Scheduled bookings in its way are postponed.
 */
export const emergencyBookingSchema = z
  .object({
    operatingRoomId: id(),
    visitId: id().nullable().default(null),
    patientId: id().nullable().default(null),
    procedure: requiredText(160),
    durationMinutes,
    notes: optionalText(300),
  })
  .refine((value) => (value.visitId === null) !== (value.patientId === null), {
    message: 'validation.required',
    path: ['patientId'],
  });

/** GET /bookings?from=…&to=…: the schedule between two times. */
export const bookingRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;
export type CreateBookingData = z.output<typeof createBookingSchema>;
export type RescheduleBookingInput = z.input<typeof rescheduleBookingSchema>;
export type RescheduleBookingData = z.output<typeof rescheduleBookingSchema>;
export type EmergencyBookingInput = z.input<typeof emergencyBookingSchema>;
export type EmergencyBookingData = z.output<typeof emergencyBookingSchema>;
