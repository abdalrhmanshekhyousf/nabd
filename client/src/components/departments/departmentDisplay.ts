import type { DepartmentCode } from '@nabd/shared';
import type { TFunction } from 'i18next';

export type Department = {
  id: string;
  name: string;
  code: DepartmentCode | null;
  roomCount: number;
  staffCount: number;
};

/** Built-in departments are shown in the user's language; custom ones as named. */
export function departmentLabel(department: Pick<Department, 'code' | 'name'>, t: TFunction) {
  return department.code ? t(`departmentCodes.${department.code}`) : department.name;
}
