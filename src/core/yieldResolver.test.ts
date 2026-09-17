import { describe, it, expect } from 'vitest';
import { resolveYield } from './yieldResolver';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient, YieldSample } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';

const chicken: Ingredient = {
  id: 'chicken-breast',
  name: 'Chicken breast',
  category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5 },
  publishedYield: { roasted: 0.75 },
  absorbsWater: false,
  source: 'usda',
  sourceRef: 'FDC 171077',
  archived: false,
};

const sample = (over: Partial<YieldSample> = {}): YieldSample => ({
  ingredientId: 'chicken-breast',
  method: 'roasted',
  rawUsedG: g(1000),
  cookedWeightG: g(740),
  excludeFromCalibration: false,
  ...over,
});

describe('resolveYield', () => {
  it('uses the published factor when there are no samples', () => {
    expect(resolveYield(chicken, 'roasted', [], CATEGORY_YIELD))
      .toEqual({ factor: 0.75, source: 'published', sampleCount: 0 });
  });

  it('falls back to the category default when the method is unpublished', () => {
    const r = resolveYield(chicken, 'boiled', [], CATEGORY_YIELD);
    expect(r.source).toBe('categoryDefault');
    expect(r.factor).toBe(CATEGORY_YIELD.meat.boiled);
    expect(r.sampleCount).toBe(0);
  });

  it('prefers the mean of the user samples over the published factor', () => {
    const samples = [sample(), sample({ cookedWeightG: g(700) })];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD))
      .toEqual({ factor: 0.72, source: 'measured', sampleCount: 2 });
  });

  it('ignores samples for other ingredients or other methods', () => {
    const samples = [
      sample({ ingredientId: 'beef-sirloin' }),
      sample({ method: 'grilled' }),
    ];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD).source).toBe('published');
  });

  it('ignores samples excluded from calibration', () => {
    const samples = [sample({ excludeFromCalibration: true })];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD).source).toBe('published');
  });

  it('ignores samples with zero raw weight rather than dividing by zero', () => {
    const samples = [sample({ rawUsedG: g(0) })];
    const r = resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD);
    expect(r.source).toBe('published');
    expect(Number.isFinite(r.factor)).toBe(true);
  });

  it('handles a water-absorbing ingredient whose measured yield exceeds 1', () => {
    const rice: Ingredient = {
      ...chicken, id: 'white-rice', name: 'White rice',
      category: 'grain', publishedYield: {}, absorbsWater: true,
    };
    const samples = [sample({ ingredientId: 'white-rice', method: 'boiled', rawUsedG: g(100), cookedWeightG: g(280) })];
    expect(resolveYield(rice, 'boiled', samples, CATEGORY_YIELD))
      .toEqual({ factor: 2.8, source: 'measured', sampleCount: 1 });
  });
});
