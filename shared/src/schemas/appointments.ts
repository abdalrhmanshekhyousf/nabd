import { z } from 'zod';
import { VISIT_LENGTHS } from '../appointments.js';
import { optionalText } from './common.js';

const minute = z
  .number('validation.invalid')
  .int('validation.invalid')
  .min(0, 'validation.invalid')
  .max(1440, 'validation.invalid')
  .refine((m) => m % 5 === 0, 'validation.invalid');

const day = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: minute,
    endMinute: minute,
  })
  .refine(({ startMinute, endMinute }) => startMinute < endMinute, {
    message: 'validation.invalid',
    path: ['endMinute'],
  });

/**
 * PUT /staff/:id/schedule (task 3.19): the admin sets a doctor's working days
 * and their hours. Days left out are days off.
 */
export const scheduleSchema = z.object({
  days: z
    .array(day)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, {
      message: 'validation.invalid',
    }),
});

/** PUT /doctors/me/visit-length: the doctor's own choice. */
export const visitLengthSchema = z.object({
  visitMinutes: z.union(
    VISIT_LENGTHS.map((m) => z.literal(m)),
    'validation.invalid',
  ),
});

export type ScheduleInput = z.input<typeof scheduleSchema>;
export type ScheduleData = z.output<typeof scheduleSchema>;

/**
 * POST /appointments (task 3.20): a slot with a doctor. A patient books for
 * themselves (patientId left out); reception names the patient (4.2).
 */
export const bookAppointmentSchema = z.object({
  doctorId: z.uuid('validation.required'),
  patientId: z.uuid('validation.invalid').nullable().default(null),
  startsAt: z.iso.datetime({ offset: true, message: 'validation.required' }),
  reason: optionalText(300),
});

/** GET /appointments/slots: a doctor's free slots from a local day. */
export const slotsQuerySchema = z.object({
  doctorId: z.uuid(),
  from: z.iso.date().optional(),
  days: z.coerce.number().int().min(1).max(31).default(14),
});

export type BookAppointmentInput = z.input<typeof bookAppointmentSchema>;
export type BookAppointmentData = z.output<typeof bookAppointmentSchema>;
