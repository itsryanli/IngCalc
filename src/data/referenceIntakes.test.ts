import { describe, it, expect } from 'vitest';
import { RNI_MY, rniFor } from './rniMY';
import { DV_US } from './dvUS';

describe('RNI_MY', () => {
  it('covers adult ages for both sexes without gaps', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const age of [19, 25, 40, 55, 65, 80]) {
        const v = rniFor(sex, age);
        expect(Object.keys(v).length, `${sex} ${age}`).toBeGreaterThan(0);
        expect(v.potassium, `${sex} ${age}`).toBeGreaterThan(0);
      }
    }
  });

  it('has non-overlapping bands within a sex', () => {
    for (const sex of ['male', 'female'] as const) {
      const bands = RNI_MY.bands.filter((b) => b.sex === sex).sort((a, b) => a.minAge - b.minAge);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i]!.minAge, `${sex} band ${i}`).toBeGreaterThan(bands[i - 1]!.maxAge);
      }
    }
  });

  it('recommends more iron for women of reproductive age than for men', () => {
    expect(rniFor('female', 30).iron!).toBeGreaterThan(rniFor('male', 30).iron!);
  });

  it('keeps every value finite and positive', () => {
    for (const band of RNI_MY.bands) {
      for (const [k, v] of Object.entries(band.values)) {
        expect(Number.isFinite(v), `${band.sex} ${band.minAge} ${k}`).toBe(true);
        expect(v, `${band.sex} ${band.minAge} ${k}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('DV_US', () => {
  it('covers every micronutrient the app displays', () => {
    for (const k of ['potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium'] as const) {
      expect(DV_US[k], k).toBeGreaterThan(0);
    }
  });
});

// Regression coverage for a real bug: an earlier version of this table used
// coarser bands than the source and "rounded" a nutrient to the nearest
// published band when its real cut point fell inside that band — silently
// wrong for part of the band's age range. These tests probe both sides of
// every band edge this file actually ships, so a future re-banding that
// reintroduces that shortcut fails loudly instead of passing by accident
// (the brief's own sampled ages above happen to miss every edge below).
describe('RNI_MY boundary precision', () => {
  it('matches the source exactly at the magnesium 30/31 boundary', () => {
    expect(rniFor('male', 30).magnesium).toBe(400);
    expect(rniFor('male', 31).magnesium).toBe(420);
    expect(rniFor('female', 30).magnesium).toBe(310);
    expect(rniFor('female', 31).magnesium).toBe(320);
  });

  it('matches the source exactly at the zinc 65/66 boundary', () => {
    expect(rniFor('male', 65).zinc).toBe(6.3);
    expect(rniFor('male', 66).zinc).toBe(6.2);
    expect(rniFor('female', 65).zinc).toBe(4.4);
    expect(rniFor('female', 66).zinc).toBe(4.3);
  });

  it('matches the source exactly at the female calcium 49/50 boundary', () => {
    // Caught during the same fix, not originally flagged by review: calcium
    // steps up a year earlier than iron/magnesium's 51 boundary for women.
    expect(rniFor('female', 49).calcium).toBe(1000);
    expect(rniFor('female', 50).calcium).toBe(1200);
  });

  it('matches the source exactly at the sodium 69/70 boundary', () => {
    expect(rniFor('male', 69).sodium).toBe(1500);
    expect(rniFor('male', 70).sodium).toBe(1200);
    expect(rniFor('female', 69).sodium).toBe(1500);
    expect(rniFor('female', 70).sodium).toBe(1200);
  });

  it('matches the source exactly at the female iron 50/51 boundary', () => {
    expect(rniFor('female', 50).iron).toBe(20);
    expect(rniFor('female', 51).iron).toBe(8);
  });
});
