import { z } from 'zod';

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
    slotMinutes: z
      .number()
      .int()
      .min(5)
      .max(240)
      .refine((m) => m % 5 === 0),
  })
  .refine(({ startMinute, endMinute }) => startMinute < endMinute, {
    message: 'validation.invalid',
    path: ['endMinute'],
  })
  .refine(({ startMinute, endMinute, slotMinutes }) => endMinute - startMinute >= slotMinutes, {
    message: 'validation.invalid',
    path: ['endMinute'],
  });

/**
 * PUT /doctors/me/schedule (task 3.19): the doctor's working days, each with
 * its hours and visit length. Days left out are days off.
 */
export const scheduleSchema = z.object({
  days: z
    .array(day)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, {
      message: 'validation.invalid',
    }),
});

export type ScheduleInput = z.input<typeof scheduleSchema>;
export type ScheduleData = z.output<typeof scheduleSchema>;
