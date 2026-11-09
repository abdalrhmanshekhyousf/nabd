import { z } from 'zod';
import { REPORT_KINDS } from '../reports.js';
import { optionalText, requiredText } from './common.js';

const instant = z.iso.datetime({ offset: true, message: 'validation.invalid' });
const YEAR = 366 * 24 * 3_600_000;

/** A report's period: from before to, at most a year. */
export const reportPeriodSchema = z
  .object({ from: instant, to: instant })
  .refine(({ from, to }) => Date.parse(from) < Date.parse(to), {
    message: 'validation.invalid',
    path: ['to'],
  })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) <= YEAR, {
    message: 'validation.invalid',
    path: ['to'],
  });

/** POST /reports (task 3.11): send the report of a period with notes for the admin. */
export const submitReportSchema = z
  .object({
    kind: z.enum(REPORT_KINDS, 'validation.required'),
    from: instant,
    to: instant,
    notes: optionalText(1000),
    // The pharmacist may correct the medicines asked for but missing (task 3.11);
    // left out, the worked-out list is kept.
    unavailable: z
      .array(
        z.object({
          drugName: requiredText(120),
          times: z
            .number('validation.invalid')
            .int('validation.invalid')
            .min(1, 'validation.invalid')
            .max(9999, 'validation.invalid'),
        }),
      )
      .max(30, 'validation.invalid')
      .optional(),
  })
  .refine(({ from, to }) => Date.parse(from) < Date.parse(to), {
    message: 'validation.invalid',
    path: ['to'],
  });

export type SubmitReportInput = z.input<typeof submitReportSchema>;
export type SubmitReportData = z.output<typeof submitReportSchema>;
