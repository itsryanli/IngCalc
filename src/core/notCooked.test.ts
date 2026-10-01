import { describe, it, expect } from 'vitest';
import { computeCooked } from './nutrition';
import { compareMethods } from './methodCompare';
import { referenceFactor } from './calibration';
import { resolveYield } from './yieldResolver';
import { retentionFor } from './retention';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

// Leafy greens: real retention figures exist for them, so "not cooked" must
// override something, not just fall through to an empty lookup.
const kangkung: Ingredient = {
  id: 'kangkung', name: 'Kangkung', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 19, protein: 2.6, potassium: 312, magnesium: 71 },
  publishedYield: { boiled: 1.1 }, absorbsWater: false, source: 'usda', archived: false,
};

describe('not cooked (as is)', () => {
  it('keeps the weight exactly, whatever samples or tables say', () => {
    const samples = [{ ingredientId: 'kangkung', method: 'asIs' as const, rawUsedG: g(100), cookedWeightG: g(50), excludeFromCalibration: false }];
    expect(resolveYield(kangkung, 'asIs', samples, CATEGORY_YIELD)).toEqual({ factor: 1, source: 'notCooked', sampleCount: 0 });
  });

  it('loses no nutrients, and says so as a fact rather than an assumption', () => {
    expect(retentionFor(RETENTION, 'vegetable', 'asIs', 'potassium')).toEqual({ factor: 1, assumed: false });
  });

  it('gives the raw nutrients for the weight eaten', () => {
    const r = computeCooked({
      ingredient: kangkung, rawG: g(200), method: 'asIs', samples: [],
      categoryYield: CATEGORY_YIELD, retention: RETENTION,
    });
    expect(r.cookedWeightG).toBe(200);
    expect(r.totals.potassium).toBeCloseTo(624, 6);
    expect(r.per100gCooked.potassium).toBeCloseTo(312, 6);
    expect(r.assumedRetentionFor).toEqual([]);
    expect(r.steps.map((s) => s.sourceNote)).toContain('not cooked — weight unchanged');
  });

  it('expects a cook recorded as not cooked to weigh what it weighed raw', () => {
    expect(referenceFactor(kangkung, 'asIs', CATEGORY_YIELD)).toBe(1);
  });

  it('is left out of the cooking-method comparison', () => {
    const rows = compareMethods(kangkung, [], CATEGORY_YIELD, RETENTION, ['potassium']);
    expect(rows.map((r) => r.method)).not.toContain('asIs');
    expect(rows).toHaveLength(7);
  });
});
