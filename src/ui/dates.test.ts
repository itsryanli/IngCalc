import { describe, it, expect } from 'vitest';
import { formatIsoDate, todayIso } from './dates';

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
