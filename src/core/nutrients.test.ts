import { describe, it, expect } from 'vitest';
import { g } from './units';
import {
  zeroNutrients, scaleNutrients, nutrientsForWeight, addNutrients, mapNutrients,
} from './nutrients';
import { NUTRIENT_KEYS } from './types';

const sample = { ...zeroNutrients(), kcal: 120, protein: 22.5, potassium: 334 };

describe('nutrients', () => {
  it('creates a zero profile containing every key', () => {
    const z = zeroNutrients();
    expect(Object.keys(z).sort()).toEqual([...NUTRIENT_KEYS].sort());
    expect(Object.values(z).every((v) => v === 0)).toBe(true);
  });

  it('scales every nutrient by a factor', () => {
    const r = scaleNutrients(sample, 2);
    expect(r.kcal).toBe(240);
    expect(r.protein).toBe(45);
    expect(r.potassium).toBe(668);
  });

  it('converts a per-100g profile to an absolute weight', () => {
    const r = nutrientsForWeight(sample, g(250));
    expect(r.kcal).toBeCloseTo(300, 6);
    expect(r.protein).toBeCloseTo(56.25, 6);
  });

  it('returns zeros for zero weight', () => {
    const r = nutrientsForWeight(sample, g(0));
    expect(r.protein).toBe(0);
  });

  it('adds two profiles key by key', () => {
    const r = addNutrients(sample, sample);
    expect(r.protein).toBe(45);
    expect(r.fibre).toBe(0);
  });

  it('maps each nutrient with access to its key', () => {
    const r = mapNutrients(sample, (v, k) => (k === 'protein' ? v * 10 : v));
    expect(r.protein).toBe(225);
    expect(r.kcal).toBe(120);
  });
});
