import { describe, expect, it } from 'vitest';
import { latinDigits, readCount } from './numbers';

describe('numbers', () => {
  it('reads Arabic-Indic and Persian digits', () => {
    expect(latinDigits('٤٥ علبة')).toBe('45 علبة');
    expect(latinDigits('۱۲')).toBe('12');
    expect(readCount('٢٠٠')).toBe(200);
    expect(readCount(' 1 000 ')).toBe(1000);
  });

  it('empty or not a whole number is NaN', () => {
    expect(readCount('')).toBeNaN();
    expect(readCount('2.5')).toBeNaN();
    expect(readCount('عشرة')).toBeNaN();
  });
});
