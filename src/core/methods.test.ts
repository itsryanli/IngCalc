import { describe, it, expect } from 'vitest';
import { startingMethod } from './methods';
import type { Ingredient } from './types';
import { zeroNutrients } from './nutrients';

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: 'x', name: 'x', category: 'meat', per100gRaw: zeroNutrients(), publishedYield: {},
  absorbsWater: false, source: 'user', archived: false, ...over,
});

describe('startingMethod', () => {
  it("uses the ingredient's own default first", () => {
    expect(startingMethod(ing({ category: 'fruit', defaultMethod: 'steamed' }), 'roasted')).toBe('steamed');
    expect(startingMethod(ing({ defaultMethod: 'asIs' }), 'roasted')).toBe('asIs');
  });

  it('starts fruit and dairy on not cooked', () => {
    expect(startingMethod(ing({ category: 'fruit' }), 'roasted')).toBe('asIs');
    expect(startingMethod(ing({ category: 'dairy' }), 'boiled')).toBe('asIs');
  });

  it('otherwise keeps what the form had', () => {
    expect(startingMethod(ing({ category: 'meat' }), 'grilled')).toBe('grilled');
  });
});
