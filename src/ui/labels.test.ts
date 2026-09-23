import { describe, it, expect } from 'vitest';
import { describeEntry, entryItemName } from './labels';
import type { Batch, CookSession, Ingredient, MealEntry } from '../core/types';
import type { MealContext } from '../core/meals';
import { g } from '../core/units';
import { zeroNutrients } from '../core/nutrients';

// Fixtures adapted from src/core/meals.test.ts — copied rather than shared,
// since these files are allowed to diverge.
const chicken: Ingredient = {
  id: 'chicken', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5, potassium: 334, iron: 0.7 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false, source: 'usda', archived: false,
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken', rawWeightG: g(1000),
  purchase: { pricePaidMYR: 20 as never, location: 'Jaya Grocer', date: '2026-09-18' },
  createdAt: 1,
};

// 400g raw roasted to 284g, cut into 4 portions of 71g.
const session: CookSession = {
  id: 's1', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
};

// A batch whose ingredient has since been archived out of the catalogue:
// ctx.ingredientById genuinely returns undefined for it, distinct from a
// missing session or missing batch.
const archivedBatch: Batch = {
  id: 'b2', ingredientId: 'ghost', rawWeightG: g(500),
  purchase: { pricePaidMYR: 10 as never, location: 'Pasar', date: '2026-09-18' },
  createdAt: 2,
};

const archivedSession: CookSession = {
  id: 's2', batchId: 'b2', method: 'boiled',
  rawUsedG: g(200), cookedWeightG: g(150),
  cookedAt: '2026-09-19', portionCount: 2, excludeFromCalibration: false,
};

const RETENTION = { meat: { roasted: { protein: 0.98, potassium: 0.85 } } };
const CATEGORY_YIELD = { meat: { roasted: 0.71, boiled: 0.7, steamed: 0.75, panFried: 0.72,
  stirFried: 0.73, deepFried: 0.74, grilled: 0.71 } } as never;

const ctx: MealContext = {
  sessions: [session, archivedSession], batches: [batch, archivedBatch],
  ingredientById: (id) => (id === 'chicken' ? chicken : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION as never,
};

const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

describe('entryItemName', () => {
  it.each<[string, Partial<MealEntry>, string]>([
    ['quick', { kind: 'quick', name: 'Teh tarik', kcal: 180 }, 'Teh tarik'],
    ['ingredient', { kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) }, 'Chicken breast, roasted'],
    ['weight', { kind: 'weight', cookSessionId: 's1', grams: g(142) }, 'Chicken breast, roasted'],
    ['portion', { kind: 'portion', cookSessionId: 's1', portions: 2 }, 'Chicken breast, roasted'],
    ['missing cook', { kind: 'portion', cookSessionId: 'gone', portions: 1 }, 'A cook that is no longer in your kitchen'],
    ['unknown ingredient', { kind: 'weight', cookSessionId: 's2', grams: g(50) }, 'Unknown ingredient, boiled'],
  ])('names a %s entry without its amount', (_, over, expected) => {
    expect(entryItemName(entry(over), ctx)).toBe(expected);
  });

  it('is always the start of the Log description, so the two cannot disagree', () => {
    const kinds: Partial<MealEntry>[] = [
      { kind: 'quick', name: 'Teh tarik', kcal: 180 },
      { kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) },
      { kind: 'weight', cookSessionId: 's1', grams: g(142) },
      { kind: 'portion', cookSessionId: 's1', portions: 1 },
    ];
    for (const over of kinds) {
      const e = entry(over);
      expect(describeEntry(e, ctx).startsWith(entryItemName(e, ctx))).toBe(true);
    }
  });
});

describe('describeEntry', () => {
  it('describes a quick entry by its name, marked as quick', () => {
    const e = entry({ kind: 'quick', name: 'Teh tarik', kcal: 180, proteinG: 4 });
    expect(describeEntry(e, ctx)).toBe('Teh tarik (quick)');
  });

  it('describes an ingredient entry by name, lowercased method and cooked grams', () => {
    const e = entry({ kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) });
    expect(describeEntry(e, ctx)).toBe('Chicken breast, roasted — 142g');
  });

  it('describes a weighed entry by the ingredient resolved through the session\'s batch', () => {
    const e = entry({ kind: 'weight', cookSessionId: 's1', grams: g(142) });
    expect(describeEntry(e, ctx)).toBe('Chicken breast, roasted — 142g');
  });

  it('pluralises a portion entry\'s amount', () => {
    const e = entry({ kind: 'portion', cookSessionId: 's1', portions: 2 });
    expect(describeEntry(e, ctx)).toBe('Chicken breast, roasted — 2 portions');
  });

  it('falls back when the entry\'s cook session no longer exists', () => {
    const e = entry({ kind: 'portion', cookSessionId: 'gone', portions: 1 });
    expect(describeEntry(e, ctx)).toBe('A cook that is no longer in your kitchen');
  });

  it('names an unresolvable ingredient when the batch resolves but the ingredient does not', () => {
    const e = entry({ kind: 'weight', cookSessionId: 's2', grams: g(50) });
    expect(describeEntry(e, ctx)).toBe('Unknown ingredient, boiled — 50g');
  });
});
