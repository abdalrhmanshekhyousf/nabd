import { VALIDATION_KEYS } from '@nabd/shared';
import { describe, expect, it } from 'vitest';
import { ar } from './locales/ar';
import { en } from './locales/en';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '.';

const html = document.documentElement;

function flatten(obj: object, prefix = ''): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null
      ? { ...acc, ...flatten(value, path) }
      : { ...acc, [path]: value };
  }, {});
}

describe('i18n', () => {
  it('starts in Arabic, right-to-left', () => {
    expect(html.lang).toBe('ar');
    expect(html.dir).toBe('rtl');
  });

  it('switching language flips direction, title and saves the choice', async () => {
    await setLanguage('en');
    expect(html.lang).toBe('en');
    expect(html.dir).toBe('ltr');
    expect(document.title).toBe(en.app.title);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');

    await setLanguage('ar');
    expect(html.dir).toBe('rtl');
    expect(document.title).toBe(ar.app.title);
  });

  it('ar and en have the same keys and no empty texts', () => {
    const arKeys = flatten(ar);
    const enKeys = flatten(en);

    expect(Object.keys(enKeys).sort()).toEqual(Object.keys(arKeys).sort());
    for (const value of [...Object.values(arKeys), ...Object.values(enKeys)]) {
      expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
    }
  });

  it('translates every validation message of the shared schemas', () => {
    const arKeys = flatten(ar);
    const enKeys = flatten(en);
    for (const key of VALIDATION_KEYS) {
      expect(arKeys[key], key).toEqual(expect.any(String));
      expect(enKeys[key], key).toEqual(expect.any(String));
    }
  });
});
