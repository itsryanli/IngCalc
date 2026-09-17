import { describe, it, expect } from 'vitest';
import { CATEGORIES, COOK_METHODS } from '../core/types';
import { CATEGORY_YIELD } from './categoryYield';

describe('CATEGORY_YIELD', () => {
  it('covers every category and method pair', () => {
    for (const c of CATEGORIES) {
      for (const m of COOK_METHODS) {
        const v = CATEGORY_YIELD[c][m];
        expect(typeof v, `${c}.${m}`).toBe('number');
      }
    }
  });

  it('keeps every factor within a plausible range', () => {
    for (const c of CATEGORIES) {
      for (const m of COOK_METHODS) {
        const v = CATEGORY_YIELD[c][m];
        expect(v, `${c}.${m}`).toBeGreaterThan(0.3);
        expect(v, `${c}.${m}`).toBeLessThanOrEqual(3.5);
      }
    }
  });

  it('expects grains to gain weight when boiled or steamed', () => {
    expect(CATEGORY_YIELD.grain.boiled).toBeGreaterThan(1);
    expect(CATEGORY_YIELD.grain.steamed).toBeGreaterThan(1);
  });

  it('expects meat to lose weight under dry heat', () => {
    expect(CATEGORY_YIELD.meat.roasted).toBeLessThan(1);
    expect(CATEGORY_YIELD.meat.grilled).toBeLessThan(1);
  });

  // Task 9's flagship sign-flip correction: the brief's tables assumed boiled vegetables lose
  // ~10% of their mass, but 8 of 10 real USDA raw/cooked pairs checked show them GAINING mass
  // from water uptake instead. Reverting this to the old, wrong-signed 0.90 must fail here —
  // before this test existed, it left all 249 other tests green while kangkung (whose own
  // boiled factor was deliberately deleted, so it falls through to exactly this default)
  // silently rendered a smaller-than-raw cooked weight for a vegetable that actually gains mass.
  it('expects boiled vegetables to gain weight from water uptake, not lose it', () => {
    expect(CATEGORY_YIELD.vegetable.boiled).toBeGreaterThanOrEqual(1);
  });
});
