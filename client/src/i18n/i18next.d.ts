import 'i18next';
import type { Translation } from './locales/ar';

// Makes t('...') keys type-checked and autocompleted.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Translation };
  }
}
