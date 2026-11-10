import { z } from 'zod';
import { VISIT_LENGTHS } from '../appointments.js';

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
