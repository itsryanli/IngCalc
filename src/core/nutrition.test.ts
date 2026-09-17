// src/core/nutrition.test.ts
import { describe, it, expect } from 'vitest';
import { computeCooked, computeRaw, rawFromCooked } from './nutrition';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const chicken: Ingredient = {
  id: 'chicken-breast',
  name: 'Chicken breast',
  category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5, fat: 2.6, potassium: 334 },
  publishedYield: { roasted: 0.75 },
  absorbsWater: false,
  source: 'usda',
  sourceRef: 'FDC 171077',
  archived: false,
};

const input = {
  ingredient: chicken,
  rawG: g(1000),
  method: 'roasted' as const,
  samples: [],
  categoryYield: CATEGORY_YIELD,
  retention: RETENTION,
};

describe('computeRaw', () => {
  it('scales the per-100g profile to the given weight', () => {
    const r = computeRaw(chicken, g(250));
    expect(r.totals.protein).toBeCloseTo(56.25, 6);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

describe('computeCooked', () => {
  it('applies the yield factor to the weight', () => {
    expect(computeCooked(input).cookedWeightG).toBeCloseTo(750, 6);
  });

  it('concentrates protein into the smaller cooked weight', () => {
    const r = computeCooked(input);
    // 1000g raw x 22.5g/100g = 225g protein, x 0.98 retention = 220.5g,
    // over 750g cooked = 29.4g per 100g.
    expect(r.totals.protein).toBeCloseTo(220.5, 4);
    expect(r.per100gCooked.protein).toBeCloseTo(29.4, 4);
    expect(r.per100gCooked.protein).toBeGreaterThan(chicken.per100gRaw.protein);
  });

  it('leaches potassium separately from water loss', () => {
    const r = computeCooked(input);
    // 3340mg raw x 0.90 dry-heat retention = 3006mg.
    expect(r.totals.potassium).toBeCloseTo(3006, 3);
  });

  it('reports the yield provenance', () => {
    expect(computeCooked(input).yieldUsed).toEqual({ factor: 0.75, source: 'published', sampleCount: 0 });
  });

  it('produces a trace naming the yield source', () => {
    const r = computeCooked(input);
    const joined = r.steps.map((s) => `${s.label} ${s.detail} ${s.value} ${s.sourceNote ?? ''}`).join(' | ');
    expect(joined).toContain('0.75');
    expect(joined).toContain('published');
    expect(joined).toContain('750');
  });

  it('lists nutrients whose retention was assumed rather than sourced', () => {
    const r = computeCooked({ ...input, retention: {} });
    expect(r.assumedRetentionFor).toContain('protein');
    expect(r.totals.protein).toBeCloseTo(225, 4);
  });

  it('returns zeros and no division by zero for zero weight', () => {
    const r = computeCooked({ ...input, rawG: g(0) });
    expect(r.cookedWeightG).toBe(0);
    expect(r.totals.protein).toBe(0);
    expect(Number.isFinite(r.per100gCooked.protein)).toBe(true);
    expect(r.per100gCooked.protein).toBe(0);
  });

  it('lets a water-absorbing ingredient exceed its raw weight', () => {
    const rice: Ingredient = {
      ...chicken, id: 'white-rice', name: 'White rice', category: 'grain',
      per100gRaw: { ...zeroNutrients(), kcal: 360, protein: 6.6, carbs: 79 },
      publishedYield: { boiled: 2.6 }, absorbsWater: true,
    };
    const r = computeCooked({ ...input, ingredient: rice, rawG: g(100), method: 'boiled' });
    expect(r.cookedWeightG).toBeCloseTo(260, 6);
    expect(r.per100gCooked.carbs).toBeLessThan(rice.per100gRaw.carbs);
  });
});

describe('rawFromCooked', () => {
  it('inverts the yield factor', () => {
    const r = rawFromCooked(chicken, g(750), 'roasted', [], CATEGORY_YIELD);
    expect(r.rawWeightG).toBeCloseTo(1000, 6);
    expect(r.yieldUsed.source).toBe('published');
  });

  it('round-trips raw -> cooked -> raw', () => {
    const cooked = computeCooked(input).cookedWeightG;
    expect(rawFromCooked(chicken, cooked, 'roasted', [], CATEGORY_YIELD).rawWeightG).toBeCloseTo(1000, 6);
  });
});
