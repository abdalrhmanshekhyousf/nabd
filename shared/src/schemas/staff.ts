import { z } from 'zod';
import { email, id, optionalText, requiredText } from './common.js';
import { newPassword } from './hospital.js';

/** Roles the admin can give an employee (patients sign up or are registered by reception). */
export const STAFF_ROLES = [
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'CLEANER',
  'RECEPTIONIST',
  'ACCOUNTANT',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Imaging types; each radiologist handles one. Matches the RadiologyModality enum. */
export const RADIOLOGY_MODALITIES = [
  'ENDOSCOPY',
  'XRAY',
  'CT',
  'MRI',
  'PANORAMIC',
  'ECHO',
] as const;
export type RadiologyModality = (typeof RADIOLOGY_MODALITIES)[number];

/** Doctors and nurses always belong to a department (a nurse's work follows it). */
export const ROLES_NEEDING_DEPARTMENT: readonly StaffRole[] = ['DOCTOR', 'NURSE'];

/** Cleaners cover several departments, set on the assignments page (task 1.29). */
export const ROLES_WITH_MANY_DEPARTMENTS: readonly StaffRole[] = ['CLEANER'];

export const MAX_SALARY = 1_000_000_000;

/** An optional phone number: an empty field becomes null. */
const optionalPhone = () =>
  z
    .string()
    .trim()
    .nullable()
    .refine((value) => !value || /^\+?[\d\s\-()]{6,20}$/.test(value), 'validation.phoneInvalid')
    .transform((value) => value || null);

/** What every employee record has, whether being added or edited. */
const staffFields = {
  fullName: requiredText(120),
  phone: optionalPhone(),
  role: z.enum(STAFF_ROLES, 'validation.required'),
  departmentId: id().nullable(),
  specialty: optionalText(80),
  radiologyModality: z.enum(RADIOLOGY_MODALITIES, 'validation.required').nullable(),
  salary: z
    .number('validation.invalid')
    .min(0, 'validation.invalid')
    .max(MAX_SALARY, 'validation.tooMany'),
  email: email(),
};

type RoleDetails = {
  role: StaffRole;
  departmentId: string | null;
  specialty: string | null;
  radiologyModality: RadiologyModality | null;
};

/** Each role's required details, checked the same way when adding and editing. */
function checkRoleDetails(staff: RoleDetails, context: z.RefinementCtx) {
  const missing = (path: string) =>
    context.addIssue({ code: 'custom', path: [path], message: 'validation.required' });
  if (ROLES_NEEDING_DEPARTMENT.includes(staff.role) && !staff.departmentId) missing('departmentId');
  if (staff.role === 'DOCTOR' && !staff.specialty) missing('specialty');
  if (staff.role === 'RADIOLOGIST' && !staff.radiologyModality) missing('radiologyModality');
}

/** Details that don't apply to the role are dropped, not stored. */
function dropOtherRoleDetails<T extends RoleDetails>(staff: T): T {
  return {
    ...staff,
    departmentId: ROLES_WITH_MANY_DEPARTMENTS.includes(staff.role) ? null : staff.departmentId,
    specialty: staff.role === 'DOCTOR' ? staff.specialty : null,
    radiologyModality: staff.role === 'RADIOLOGIST' ? staff.radiologyModality : null,
  };
}

/** POST /staff: a new employee with their login details (task 1.27). */
export const createStaffSchema = z
  .object({ ...staffFields, password: newPassword() })
  .superRefine(checkRoleDetails)
  .transform(dropOtherRoleDetails);

/**
 * PATCH /staff/:id (task 1.28). The password is optional: empty keeps the
 * current one, a new value replaces it. `isActive: false` suspends the account.
 */
export const updateStaffSchema = z
  .object({
    ...staffFields,
    password: z.union([z.literal(''), z.null(), newPassword()]).transform((value) => value || null),
    isActive: z.boolean(),
  })
  .superRefine(checkRoleDetails)
  .transform(dropOtherRoleDetails);

/** PUT /assignments/nurses/:id: the one department a nurse works in (task 1.29). */
export const assignNurseSchema = z.object({ departmentId: id() });

/** PUT /assignments/cleaners/:id: every department a cleaner covers; may be empty. */
export const assignCleanerSchema = z.object({
  departmentIds: z
    .array(id())
    .max(100, 'validation.tooMany')
    .transform((ids) => [...new Set(ids)]),
});

/** GET /staff query: free-text search plus role and department filters. */
export const staffFilterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  departmentId: id().optional(),
});

export type CreateStaffInput = z.input<typeof createStaffSchema>;
export type CreateStaffData = z.output<typeof createStaffSchema>;
export type UpdateStaffInput = z.input<typeof updateStaffSchema>;
export type UpdateStaffData = z.output<typeof updateStaffSchema>;
export type StaffFilter = z.infer<typeof staffFilterSchema>;
export type AssignNurseInput = z.infer<typeof assignNurseSchema>;
export type AssignCleanerInput = z.infer<typeof assignCleanerSchema>;
