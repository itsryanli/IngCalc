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
});
