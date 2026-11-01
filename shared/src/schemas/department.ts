import { z } from 'zod';
import { requiredText } from './common.js';

/** Built-in departments, matching the DepartmentCode enum of the database. */
export const DEPARTMENT_CODES = [
  'EMERGENCY',
  'OPERATIONS',
  'INTERNAL_MEDICINE',
  'NEUROLOGY',
  'ORTHOPEDICS',
  'CARDIOLOGY',
  'PLASTIC_SURGERY',
  'OPHTHALMOLOGY',
  'GYNECOLOGY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
] as const;

export type DepartmentCode = (typeof DEPARTMENT_CODES)[number];

/** POST /departments and PATCH /departments/:id: a custom department's name. */
export const departmentSchema = z.object({
  name: requiredText(80),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;
