import { describe, expect, it } from 'vitest';
import { suggestEsiLevel, type EsiInput } from './triage.js';

/** A calm adult with normal signs and no tests expected: level 5. */
const calm: EsiInput = {
  breathing: true,
  consciousness: 'ALERT',
  pulse: 75,
  systolic: 120,
  diastolic: 80,
  respiratoryRate: 16,
  oxygenSaturation: 98,
  temperature: 36.8,
  painScore: 2,
  expectedExams: 0,
};

const level = (change: EsiInput) => suggestEsiLevel({ ...calm, ...change }).level;

describe('suggestEsiLevel: the report rules', () => {
  it('1 when not breathing or unresponsive, whatever else is measured', () => {
    expect(level({ breathing: false })).toBe(1);
    expect(level({ consciousness: 'UNRESPONSIVE' })).toBe(1);
    expect(
      suggestEsiLevel({ ...calm, breathing: false, consciousness: 'UNRESPONSIVE' }).reasons,
    ).toEqual([{ code: 'NOT_BREATHING' }, { code: 'UNRESPONSIVE' }]);
    expect(suggestEsiLevel({ breathing: false }).level).toBe(1);
  });

  it('2 when a vital sign is outside the normal range, naming each one', () => {
    expect(level({ pulse: 118 })).toBe(2);
    expect(level({ oxygenSaturation: 91 })).toBe(2);
    expect(level({ temperature: 39.2 })).toBe(2);
    expect(level({ systolic: 85 })).toBe(2);
    expect(suggestEsiLevel({ ...calm, pulse: 130, respiratoryRate: 28 }).reasons).toEqual([
      { code: 'ABNORMAL_VITALS', signs: ['pulse', 'respiratoryRate'] },
    ]);
  });

  it('2 when the pain is above 7, and not at 7', () => {
    expect(level({ painScore: 8 })).toBe(2);
    expect(level({ painScore: 10 })).toBe(2);
    expect(level({ painScore: 7 })).toBe(5);
  });

  it('2 when consciousness is altered but present', () => {
    expect(level({ consciousness: 'VERBAL' })).toBe(2);
    expect(level({ consciousness: 'PAIN' })).toBe(2);
  });

  it('otherwise by expected tests: two or more 3, one 4, none 5', () => {
    expect(level({ expectedExams: 2 })).toBe(3);
    expect(level({ expectedExams: 5 })).toBe(3);
    expect(level({ expectedExams: 1 })).toBe(4);
    expect(level({ expectedExams: 0 })).toBe(5);
    expect(suggestEsiLevel({ ...calm, expectedExams: 1 }).reasons).toEqual([
      { code: 'EXAMS', count: 1 },
    ]);
  });
});

describe('suggestEsiLevel: edges', () => {
  it('normal-range limits are normal', () => {
    expect(level({ pulse: 50, respiratoryRate: 20, oxygenSaturation: 92, temperature: 38 })).toBe(
      5,
    );
    expect(level({ pulse: 101 })).toBe(2);
    expect(level({ pulse: 49 })).toBe(2);
  });

  it('values that were not measured never count', () => {
    expect(level({ pulse: null, systolic: null, oxygenSaturation: null, painScore: null })).toBe(5);
  });

  it('the stronger rule wins: breathing over vital signs, vital signs over tests', () => {
    expect(level({ breathing: false, pulse: 140, expectedExams: 0 })).toBe(1);
    expect(level({ pulse: 140, expectedExams: 0 })).toBe(2);
  });

  it('an unfinished form leans to the safer level 3', () => {
    expect(suggestEsiLevel({ breathing: true, consciousness: 'ALERT' })).toEqual({
      level: 3,
      reasons: [],
    });
  });
});
