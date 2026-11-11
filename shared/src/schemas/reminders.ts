import { z } from 'zod';
import { id, requiredText } from './common.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.invalid');

/** A dose's daily times: one to six, no repeats. */
const times = z
  .array(time)
  .min(1, 'validation.required')
  .max(6, 'validation.invalid')
  .refine((list) => new Set(list).size === list.length, 'validation.invalid');

/** POST /patients/me/reminders (task 3.26): a medicine, its daily times and its days. */
export const reminderSchema = z
  .object({
    prescriptionItemId: id().nullable().default(null),
    drugName: requiredText(120),
    dose: requiredText(60),
    times,
    startDate: z.iso.date('validation.required'),
    endDate: z.iso.date('validation.invalid').nullable().default(null),
  })
  .refine(({ startDate, endDate }) => !endDate || endDate >= startDate, {
    message: 'validation.invalid',
    path: ['endDate'],
  });

/** PATCH /patients/me/reminders/:id: new times, or paused / resumed. */
export const reminderUpdateSchema = z.object({
  times: times.optional(),
  active: z.boolean().optional(),
});

/** POST /push/subscriptions (task 3.26): what the browser's push service gave. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export type ReminderInput = z.input<typeof reminderSchema>;
export type ReminderData = z.output<typeof reminderSchema>;
export type ReminderUpdateData = z.output<typeof reminderUpdateSchema>;
export type PushSubscriptionData = z.output<typeof pushSubscriptionSchema>;
