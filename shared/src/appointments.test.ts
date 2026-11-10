import { describe, expect, it } from 'vitest';
import { minuteToTime, timeToMinute, visitsInDay } from './appointments.js';

describe('schedule helpers (task 3.19)', () => {
  it('turns minutes into times and back', () => {
    expect(minuteToTime(510)).toBe('08:30');
    expect(timeToMinute('08:30')).toBe(510);
    expect(timeToMinute('8:05')).toBe(485);
    expect(timeToMinute('24:00')).toBe(1440);
    expect(timeToMinute('25:00')).toBeNaN();
    expect(timeToMinute('nope')).toBeNaN();
  });
  it('counts the whole visits in a day', () => {
    expect(visitsInDay({ weekday: 0, startMinute: 480, endMinute: 720, slotMinutes: 30 })).toBe(8);
    expect(visitsInDay({ weekday: 0, startMinute: 480, endMinute: 730, slotMinutes: 30 })).toBe(8);
  });
});
