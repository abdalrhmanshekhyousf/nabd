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
  'FILE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
