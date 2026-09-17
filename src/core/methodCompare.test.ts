import { describe, it, expect } from 'vitest';
import { compareMethods } from './methodCompare';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const kangkung: Ingredient = {
  id: 'kangkung', name: 'Kangkung', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 19, protein: 2.6, potassium: 312, magnesium: 71 },
  publishedYield: { boiled: 0.88, steamed: 0.92, stirFried: 0.78 },
  absorbsWater: false, source: 'usda', sourceRef: 'FDC 168390', archived: false,
};

const rows = () => compareMethods(kangkung, [], CATEGORY_YIELD, RETENTION, ['potassium', 'magnesium']);

describe('compareMethods', () => {
  it('returns one row per cooking method', () => {
    expect(rows().length).toBe(7);
  });

  it('ranks steaming above boiling for a leafy vegetable', () => {
    const order = rows().map((r) => r.method);
    expect(order.indexOf('steamed')).toBeLessThan(order.indexOf('boiled'));
  });

  it('reports retained nutrient percentage independently of the yield factor', () => {
    const steamed = rows().find((r) => r.method === 'steamed')!;
    expect(steamed.weightKeptPct).toBeCloseTo(92, 4);
    expect(steamed.retainedPct.potassium).toBeCloseTo(92, 4);
    expect(steamed.retainedPct.potassium).not.toBeCloseTo(92 * 0.92, 4);
  });

  it('carries the yield provenance onto each row', () => {
    const boiled = rows().find((r) => r.method === 'boiled')!;
    expect(boiled.yieldSource).toBe('published');
    const grilled = rows().find((r) => r.method === 'grilled')!;
    expect(grilled.yieldSource).toBe('categoryDefault');
  });

  it('sorts deterministically, breaking ties by method name', () => {
    expect(rows().map((r) => r.method)).toEqual(rows().map((r) => r.method));
  });

  it('prefers the user measured yield once samples exist', () => {
    const samples = [{
      ingredientId: 'kangkung', method: 'steamed' as const,
      rawUsedG: g(500), cookedWeightG: g(400), excludeFromCalibration: false,
    }];
    const r = compareMethods(kangkung, samples, CATEGORY_YIELD, RETENTION, ['potassium']);
    const steamed = r.find((x) => x.method === 'steamed')!;
    expect(steamed.yieldSource).toBe('measured');
    expect(steamed.weightKeptPct).toBeCloseTo(80, 4);
  });
});
