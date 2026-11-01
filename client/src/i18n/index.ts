import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from './locales/ar';
import { en } from './locales/en';

export const LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

// Must match the key read by the pre-paint script in index.html.
export const LANGUAGE_STORAGE_KEY = 'nabd-lang';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

export function directionOf(language: Language) {
  return language === 'ar' ? 'rtl' : 'ltr';
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : 'ar';
  } catch {
    return 'ar';
  }
}

// Flipping dir on <html> mirrors the whole layout: logical classes (ms-, pe-,
// start-, end-) follow it, and directional icons use rtl:-scale-x-100.
function applyToDocument(language: Language) {
  document.documentElement.lang = language;
  document.documentElement.dir = directionOf(language);
  document.title = i18n.t('app.title');
}

void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: readStoredLanguage(),
  fallbackLng: 'ar',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false }, // React already escapes
  initAsync: false,
});

i18n.on('languageChanged', (language) => {
  if (!isLanguage(language)) return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be blocked; the language still applies for this visit.
  }
  applyToDocument(language);
});

applyToDocument(i18n.language as Language);

// Once login exists (task 1.18) the user's saved language is applied on sign-in and
// changes are sent to their account; the Axios client (1.17) sends it to the server.
export function setLanguage(language: Language) {
  return i18n.changeLanguage(language);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'ar';
}

export default i18n;
