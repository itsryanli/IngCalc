import { describe, it, expect } from 'vitest';
import { dishFigures } from './dish';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';

const make = (id: string, over: Partial<Ingredient['per100gRaw']>, unknownNutrients?: Ingredient['unknownNutrients']): Ingredient => ({
  id, name: id, category: 'other', per100gRaw: { ...zeroNutrients(), ...over },
  publishedYield: {}, absorbsWater: false, source: 'user', archived: false,
  ...(unknownNutrients === undefined ? {} : { unknownNutrients }),
});
const flour = make('Flour', { kcal: 340, protein: 13, iron: 3.6 });
const seeds = make('Seeds', { kcal: 560, protein: 20 }, ['iron']);
const lookup = (id: string) => [flour, seeds].find((i) => i.id === id);

describe('dishFigures', () => {
  it('spreads everything that went in over the finished weight', () => {
    // 500 g flour + 100 g seeds = 1700 + 560 kcal, 65 + 20 g protein, in an 800 g loaf.
    const r = dishFigures({ items: [{ ingredientId: 'Flour', grams: g(500) }, { ingredientId: 'Seeds', grams: g(100) }], finishedWeightG: g(800) }, lookup);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.figures.per100g.kcal).toBeCloseTo(282.5, 6);
    expect(r.figures.per100g.protein).toBeCloseTo(10.625, 6);
    expect(r.figures.inputWeightG).toBe(600);
  });

  it('gets more concentrated when water bakes off, as a weighed cook does', () => {
    const recipe = (finished: number) => ({ items: [{ ingredientId: 'Flour', grams: g(500) }], finishedWeightG: g(finished) });
    const wet = dishFigures(recipe(1000), lookup);
    const dry = dishFigures(recipe(500), lookup);
    if (!wet.ok || !dry.ok) throw new Error('expected both to work');
    expect(dry.figures.per100g.protein).toBeCloseTo(wet.figures.per100g.protein * 2, 6);
  });

  it('marks a nutrient unknown when any ingredient does not know it', () => {
    const r = dishFigures({ items: [{ ingredientId: 'Flour', grams: g(500) }, { ingredientId: 'Seeds', grams: g(100) }], finishedWeightG: g(800) }, lookup);
    expect(r.ok && r.figures.unknownNutrients).toEqual(['iron']);
  });

  it('explains what is missing rather than guessing', () => {
    expect(dishFigures({ items: [], finishedWeightG: g(800) }, lookup)).toEqual({ ok: false, message: 'Add at least one ingredient.' });
    expect(dishFigures({ items: [{ ingredientId: 'Flour', grams: g(500) }], finishedWeightG: g(0) }, lookup))
      .toEqual({ ok: false, message: 'Weigh the finished dish and enter its weight.' });
    expect(dishFigures({ items: [{ ingredientId: '', grams: g(500) }], finishedWeightG: g(800) }, lookup))
      .toEqual({ ok: false, message: 'Choose an ingredient for every row.' });
    expect(dishFigures({ items: [{ ingredientId: 'Flour', grams: g(0) }], finishedWeightG: g(800) }, lookup))
      .toEqual({ ok: false, message: 'Enter how much flour went in.' });
  });
});
