import { describe, it, expect } from 'vitest';
import { dayName, formatIsoDate, shiftIso, todayIso } from './dates';

describe('todayIso', () => {
  it('uses the local calendar date, not UTC', () => {
    // 19 Sep 2026, 00:30 local. toISOString() would report the 18th anywhere
    // east of UTC — including Malaysia, where it would be wrong for the first
    // eight hours of every day.
    expect(todayIso(new Date(2026, 8, 19, 0, 30))).toBe('2026-09-19');
  });

  it('pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatIsoDate', () => {
  it('renders a readable date', () => {
    expect(formatIsoDate('2026-09-19')).toContain('2026');
    expect(formatIsoDate('2026-09-19')).toContain('19');
  });

  it('does not shift the day across a timezone boundary', () => {
    // new Date('2026-09-19') parses as UTC midnight, which formats as the 18th
    // in any negative offset. The parts are built locally to avoid that.
    expect(formatIsoDate('2026-09-19')).not.toContain('18');
  });

  it('passes through anything that is not a date', () => {
    expect(formatIsoDate('')).toBe('');
  });
});

describe('shiftIso', () => {
  it('steps back a day', () => {
    expect(shiftIso('2026-09-19', -1)).toBe('2026-09-18');
  });

  it('rolls over a month boundary', () => {
    expect(shiftIso('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('rolls over a year boundary', () => {
    expect(shiftIso('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftIso('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('dayName', () => {
  it('names today', () => {
    expect(dayName('2026-09-19', '2026-09-19')).toBe('Today');
  });

  it('names yesterday', () => {
    expect(dayName('2026-09-18', '2026-09-19')).toBe('Yesterday');
  });

  it('gives any other day its date', () => {
    expect(dayName('2026-09-01', '2026-09-19')).toBe(formatIsoDate('2026-09-01'));
  });
});
