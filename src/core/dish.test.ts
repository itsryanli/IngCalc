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

  it('gives "at least" when only some ingredients know a nutrient, and "not known" when none do', () => {
    const both = dishFigures({ items: [{ ingredientId: 'Flour', grams: g(500) }, { ingredientId: 'Seeds', grams: g(100) }], finishedWeightG: g(800) }, lookup);
    if (!both.ok) throw new Error('expected a dish');
    // Flour's iron is known, the seeds' is not: the loaf has at least the flour's.
    expect(both.figures.partialNutrients).toEqual(['iron']);
    expect(both.figures.unknownNutrients).toEqual([]);
    expect(both.figures.per100g.iron).toBeCloseTo(18 / 8, 6);

    const seedsOnly = dishFigures({ items: [{ ingredientId: 'Seeds', grams: g(100) }], finishedWeightG: g(90) }, lookup);
    expect(seedsOnly.ok && seedsOnly.figures.unknownNutrients).toEqual(['iron']);
    expect(seedsOnly.ok && seedsOnly.figures.partialNutrients).toEqual([]);
  });

  it('carries an ingredient\'s own "at least" into the dish', () => {
    const loaf = { ...make('Loaf', { iron: 2 }), partialNutrients: ['iron' as const] };
    const r = dishFigures({ items: [{ ingredientId: 'Loaf', grams: g(100) }], finishedWeightG: g(100) }, (id) => (id === 'Loaf' ? loaf : undefined));
    expect(r.ok && r.figures.partialNutrients).toEqual(['iron']);
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
