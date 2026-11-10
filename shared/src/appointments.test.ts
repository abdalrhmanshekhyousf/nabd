import { describe, expect, it } from 'vitest';
import {
  cutSlots,
  minuteToTime,
  timeToMinute,
  visitsInDay,
  weekdayOf,
  zonedDate,
  zonedInstant,
  zoneOffset,
} from './appointments.js';

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
    expect(visitsInDay({ weekday: 0, startMinute: 480, endMinute: 720 }, 30)).toBe(8);
    expect(visitsInDay({ weekday: 0, startMinute: 480, endMinute: 730 }, 30)).toBe(8);
  });
});

describe('slots in hospital time (task 3.20)', () => {
  it('knows Damascus is three hours ahead and turns local times into instants', () => {
    expect(zoneOffset(new Date('2026-11-14T10:00:00Z'))).toBe(180);
    expect(zonedInstant('2026-11-14', 8 * 60 + 30).toISOString()).toBe('2026-11-14T05:30:00.000Z');
    expect(zonedDate(new Date('2026-11-14T22:30:00Z'))).toBe('2026-11-15');
    expect(weekdayOf('2026-11-14')).toBe(6);
  });

  it('works in a zone that changes its clocks', () => {
    // Berlin: UTC+1 in winter, UTC+2 in summer.
    expect(zonedInstant('2026-01-10', 600, 'Europe/Berlin').toISOString()).toBe(
      '2026-01-10T09:00:00.000Z',
    );
    expect(zonedInstant('2026-07-10', 600, 'Europe/Berlin').toISOString()).toBe(
      '2026-07-10T08:00:00.000Z',
    );
  });

  it('cuts each working day into whole visits, skipping days off', () => {
    const week = [
      { weekday: 6, startMinute: 480, endMinute: 600 },
      { weekday: 1, startMinute: 960, endMinute: 1030 },
    ];
    const days = cutSlots(week, 30, '2026-11-14', 3); // Sat, Sun, Mon
    expect(days.map((d) => [d.date, d.slots.length])).toEqual([
      ['2026-11-14', 4],
      ['2026-11-16', 2],
    ]);
    expect(days[0]!.slots[0]).toEqual({
      startsAt: '2026-11-14T05:00:00.000Z',
      endsAt: '2026-11-14T05:30:00.000Z',
    });
    expect(days[1]!.slots.at(-1)!.endsAt).toBe('2026-11-16T14:00:00.000Z');
  });
});
