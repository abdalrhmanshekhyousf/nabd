// Stable error codes the API returns in { error: { code } }. The server words the
// message in the user's language; clients branch on the code.
export const ERROR_CODES = [
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'HOSPITAL_REQUIRED',
  'ACCOUNT_DISABLED',
  'INVALID_REFRESH_TOKEN',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'DEPARTMENT_EXISTS',
  'DEPARTMENT_IN_USE',
  'ROOM_EXISTS',
  'ROOM_IN_USE',
  'BED_EXISTS',
  'BED_IN_USE',
  'OPERATING_ROOM_EXISTS',
  'OPERATING_ROOM_IN_USE',
  'EMAIL_TAKEN',
  'VISIT_CLOSED',
  'FILE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
