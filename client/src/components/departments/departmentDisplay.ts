import type { DepartmentCode, DepartmentHead } from '@nabd/shared';
import type { TFunction } from 'i18next';

export type Department = {
  id: string;
  name: string;
  code: DepartmentCode | null;
  roomCount: number;
  staffCount: number;
  /** The head (user addition, task 4.4); lists that don't need it may leave it out. */
  head?: DepartmentHead | null;
};

/** Built-in departments are shown in the user's language; custom ones as named. */
export function departmentLabel(department: Pick<Department, 'code' | 'name'>, t: TFunction) {
  return department.code ? t(`departmentCodes.${department.code}`) : department.name;
}
