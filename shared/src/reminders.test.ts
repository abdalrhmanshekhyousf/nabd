import { describe, expect, it } from 'vitest';
import { suggestTimes } from './reminders.js';
import { reminderSchema } from './schemas/reminders.js';

describe('medication reminders (task 3.26)', () => {
  it('suggests dose times from the frequency the doctor wrote', () => {
    expect(suggestTimes('مرة باليوم')).toEqual(['08:00']);
    expect(suggestTimes('مرتين باليوم')).toEqual(['08:00', '20:00']);
    expect(suggestTimes('3 مرات باليوم')).toEqual(['08:00', '14:00', '20:00']);
    expect(suggestTimes('كل 8 ساعات')).toEqual(['08:00', '16:00', '00:00']);
    expect(suggestTimes('every 12 h')).toEqual(['08:00', '20:00']);
    expect(suggestTimes('قبل النوم')).toEqual(['21:00']);
    expect(suggestTimes('twice daily')).toEqual(['08:00', '20:00']);
  });

  it('needs at least one real time, no repeats, and days in order', () => {
    const base = { drugName: 'أملوديبين', dose: '5 ملغ', startDate: '2026-11-12' };
    expect(reminderSchema.safeParse({ ...base, times: ['08:00', '20:00'] }).success).toBe(true);
    expect(reminderSchema.safeParse({ ...base, times: [] }).success).toBe(false);
    expect(reminderSchema.safeParse({ ...base, times: ['25:00'] }).success).toBe(false);
    expect(reminderSchema.safeParse({ ...base, times: ['08:00', '08:00'] }).success).toBe(false);
    expect(
      reminderSchema.safeParse({ ...base, times: ['08:00'], endDate: '2026-11-01' }).success,
    ).toBe(false);
  });
});
