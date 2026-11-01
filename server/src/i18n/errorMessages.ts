import type { ErrorCode } from '@nabd/shared';

export type Language = 'ar' | 'en';

// User-facing error messages in both languages; the client sends its current
// language in Accept-Language and shows the message as-is.
const MESSAGES: Record<ErrorCode, Record<Language, string>> = {
  NOT_FOUND: { ar: 'المطلوب غير موجود', en: 'Not found' },
  VALIDATION_ERROR: {
    ar: 'في بيانات ناقصة أو غير صحيحة',
    en: 'Some information is missing or invalid',
  },
  INVALID_CREDENTIALS: {
    ar: 'الإيميل أو كلمة السر غير صحيحة',
    en: 'The email or password is incorrect',
  },
  HOSPITAL_REQUIRED: {
    ar: 'اختار المستشفى يلي بدك تدخل عليه',
    en: 'Choose the hospital to sign in to',
  },
  ACCOUNT_DISABLED: {
    ar: 'هالحساب موقوف، تواصل مع إدارة المستشفى',
    en: 'This account is disabled; contact the hospital administration',
  },
  INVALID_REFRESH_TOKEN: {
    ar: 'انتهت الجلسة، سجّل دخولك من جديد',
    en: 'Your session has ended; please sign in again',
  },
  UNAUTHENTICATED: { ar: 'سجّل دخولك لتكمل', en: 'Sign in to continue' },
  FORBIDDEN: { ar: 'ما عندك صلاحية لهالشي', en: 'You do not have access to this' },
  DEPARTMENT_EXISTS: {
    ar: 'في قسم بنفس الاسم بالمستشفى',
    en: 'A department with this name already exists',
  },
  DEPARTMENT_IN_USE: {
    ar: 'ما فيك تحذف قسم فيه غرف أو موظفين، انقلهم أو احذفهم أول',
    en: 'This department still has rooms or staff; move or remove them first',
  },
  FILE_REQUIRED: { ar: 'اختار ملف لترفعه', en: 'Choose a file to upload' },
  FILE_TOO_LARGE: {
    ar: 'الملف أكبر من المسموح (2 ميغا كحد أقصى)',
    en: 'The file is too large (2 MB at most)',
  },
  UNSUPPORTED_FILE_TYPE: {
    ar: 'نوع الملف مو مدعوم، استعمل صورة PNG أو JPG أو WebP',
    en: 'Unsupported file type; use a PNG, JPG or WebP image',
  },
  INTERNAL_ERROR: {
    ar: 'صار خطأ بالسيرفر، جرّب بعد شوي',
    en: 'Something went wrong on the server; try again shortly',
  },
};

export function errorMessage(code: ErrorCode, language: Language) {
  return MESSAGES[code][language];
}
