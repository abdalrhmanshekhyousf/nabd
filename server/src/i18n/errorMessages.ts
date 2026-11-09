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
  ROOM_EXISTS: {
    ar: 'في غرفة بنفس الرقم بهالقسم',
    en: 'A room with this number already exists in this department',
  },
  ROOM_IN_USE: {
    ar: 'ما فيك تحذف غرفة فيها مرضى أو أسرّة محجوزة',
    en: 'This room has occupied or reserved beds',
  },
  BED_EXISTS: {
    ar: 'في سرير بنفس الاسم بهالغرفة',
    en: 'A bed with this label already exists in this room',
  },
  BED_IN_USE: {
    ar: 'هالسرير عليه مريض أو محجوز هلق',
    en: 'This bed is occupied or reserved right now',
  },
  OPERATING_ROOM_EXISTS: {
    ar: 'في غرفة عمليات بنفس الاسم',
    en: 'An operating room with this name already exists',
  },
  OPERATING_ROOM_IN_USE: {
    ar: 'غرفة العمليات مشغولة هلق (حجز أو تحضير أو عملية أو تعقيم)',
    en: 'The operating room is in use right now (booked, preparing, surgery or sterilization)',
  },
  DOCTOR_UNAVAILABLE: {
    ar: 'الطبيب مو متفرّغ هلق، اختار طبيب متفرّغ',
    en: 'This doctor is not available now; choose an available one',
  },
  INVALID_TRANSITION: {
    ar: 'الغرفة مو بالحالة اللي بتسمح بهالخطوة',
    en: 'The room is not in a state that allows this step',
  },
  BOOKING_CONFLICT: {
    ar: 'الغرفة محجوزة بهالوقت، اختار وقت أو غرفة تانية',
    en: 'The room is booked at that time; choose another time or room',
  },
  ROOM_OUT_OF_SERVICE: {
    ar: 'الغرفة خارج الخدمة',
    en: 'This room is out of service',
  },
  ROOM_BUSY: {
    ar: 'الغرفة مشغولة هلق (عملية أو تعقيم)، اختار غرفة تانية',
    en: 'The room is in use right now (surgery or sterilization); choose another',
  },
  ALREADY_TAKEN: {
    ar: 'حدا تاني أخد هالطلب قبلك',
    en: 'Someone else already took this request',
  },
  ITEM_EXISTS: {
    ar: 'في مادة بنفس الاسم بالمخزون',
    en: 'An item with this name is already in stock',
  },
  INVALID_CONSULTANT: {
    ar: 'اختار طبيب تاني من المستشفى',
    en: 'Choose another doctor of this hospital',
  },
  ALREADY_PENDING: {
    ar: 'هالطبيب عندو سؤال مفتوح عن هالمريض',
    en: 'This doctor already has an open question about this patient',
  },
  CONSULTATION_CLOSED: {
    ar: 'انتهت الاستشارة، وما عاد فيك تفتح الملف',
    en: 'The consultation is closed; the file is no longer open to you',
  },
  ALREADY_ADMITTED: {
    ar: 'هالمريض عندو سرير من قبل',
    en: 'This patient is already in a bed',
  },
  OUT_OF_STOCK: {
    ar: 'الكمية بالمخزون ما بتكفي',
    en: 'Not enough in stock',
  },
  USE_BOOKING: {
    ar: 'هالخطوة بتصير من الحجز، مش من زر الغرفة',
    en: 'This step happens through a booking, not a room button',
  },
  CALL_ANSWERED: {
    ar: 'هالاستدعاء انرد عليه أو انلغى',
    en: 'This call was already answered or cancelled',
  },
  CALL_PENDING: {
    ar: 'في استدعاء لهالمريض لسا بانتظار الرد',
    en: 'A call for this patient is still waiting for an answer',
  },
  NOT_ASSESSED: {
    ar: 'لازم ينعمل تقييم الخطورة أول',
    en: 'The triage has to be done first',
  },
  VISIT_CLOSED: {
    ar: 'هالزيارة انسكّرت (تحوّل المريض أو تخرّج)',
    en: 'This visit is closed (the patient was transferred or discharged)',
  },
  EMAIL_TAKEN: {
    ar: 'في حساب بهالإيميل بالمستشفى',
    en: 'An account with this email already exists in this hospital',
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
