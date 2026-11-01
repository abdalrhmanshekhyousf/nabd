// Arabic is the source language: en.ts must have exactly the same keys
// (TypeScript fails the build if one is missing).
export const ar = {
  app: {
    title: 'نبض · Nabd',
    tagline: 'منصّة إدارة المستشفيات',
  },
  common: {
    loading: 'جاري التحميل',
    backHome: 'الرجوع للرئيسية',
  },
  theme: {
    label: 'وضع العرض',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب الجهاز',
  },
  language: {
    // Written in the target language so people who can't read the current one find it.
    switchTo: 'English',
    switchToLabel: 'تغيير اللغة إلى الإنكليزية',
  },
  errors: {
    notFound: 'الصفحة غير موجودة',
  },
};

export type Translation = typeof ar;
