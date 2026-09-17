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
