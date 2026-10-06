import { describe, it, expect } from 'vitest';
import { dayTotals, entryNutrients, sessionRetainedNutrients, validateEntry, type MealContext } from './meals';
import type { Batch, CookSession, Ingredient, MealEntry, MealEntryFields } from './types';
import { g } from './units';
import { zeroNutrients } from './nutrients';

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

// protein retention 0.98 for meat/roasted; everything else falls through to 1.
const RETENTION = { meat: { roasted: { protein: 0.98, potassium: 0.85 } } };
const CATEGORY_YIELD = { meat: { roasted: 0.71, boiled: 0.7, steamed: 0.75, panFried: 0.72,
  stirFried: 0.73, deepFried: 0.74, grilled: 0.71 } } as never;

const ctx: MealContext = {
  sessions: [session], batches: [batch],
  ingredientById: (id) => (id === 'chicken' ? chicken : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION as never,
};

const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

describe('sessionRetainedNutrients', () => {
  it('applies retention to the raw weight and never a yield factor', () => {
    const r = sessionRetainedNutrients(session, chicken, RETENTION as never);
    // 400g raw = 90g protein; × 0.98 retention = 88.2g. The 0.71 yield is NOT applied:
    // cooking moves water, not protein. See execution record §3.8.
    expect(r.protein).toBeCloseTo(88.2, 6);
    expect(r.potassium).toBeCloseTo(400 / 100 * 334 * 0.85, 6);
  });
});

describe('entryNutrients', () => {
  it('gives a portion its share of the pan, scaled by cooked weight', () => {
    // One of four portions = 71g of 284g = a quarter of 88.2g protein.
    expect(entryNutrients(entry(), ctx).protein).toBeCloseTo(22.05, 6);
  });

  it('scales a weighed amount by the same denominator', () => {
    const e = entry({ kind: 'weight', cookSessionId: 's1', grams: g(142) });
    expect(entryNutrients(e, ctx).protein).toBeCloseTo(44.1, 6);
  });

  it('computes an ingredient entry through the calculator\'s own path', () => {
    const e = entry({ kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) });
    // 142g cooked ÷ 0.71 published yield = 200g raw = 45g protein × 0.98 = 44.1g.
    expect(entryNutrients(e, ctx).protein).toBeCloseTo(44.1, 6);
  });

  it('gives a quick entry its calories and protein and nothing else', () => {
    const e = entry({ kind: 'quick', name: 'Teh tarik', kcal: 180, proteinG: 4 });
    const n = entryNutrients(e, ctx);
    expect(n.kcal).toBe(180);
    expect(n.protein).toBe(4);
    expect(n.iron).toBe(0);
  });

  it('returns zeroes rather than throwing when a session cannot be resolved', () => {
    const e = entry({ cookSessionId: 'gone' });
    expect(entryNutrients(e, ctx)).toEqual(zeroNutrients());
  });
});

describe('dayTotals', () => {
  it('adds the entries up', () => {
    const t = dayTotals([entry(), entry({ id: 'm2', portions: 1 })], ctx);
    expect(t.totals.protein).toBeCloseTo(44.1, 6);
    expect(t.unknownMicroEntries).toBe(0);
    expect(t.unknownProteinEntries).toBe(0);
  });

  it('counts a quick entry as unknown micronutrients', () => {
    const t = dayTotals([entry(), entry({ id: 'm2', kind: 'quick', name: 'Nasi lemak', kcal: 640, proteinG: 12 })], ctx);
    expect(t.unknownMicroEntries).toBe(1);
    // Protein was given, so protein is still exact.
    expect(t.unknownProteinEntries).toBe(0);
  });

  it('counts a quick entry with no protein figure separately', () => {
    const t = dayTotals([entry({ kind: 'quick', name: 'Kuih', kcal: 200 })], ctx);
    expect(t.unknownMicroEntries).toBe(1);
    expect(t.unknownProteinEntries).toBe(1);
  });

  it('reports an empty day as zeroes with nothing unknown', () => {
    expect(dayTotals([], ctx)).toEqual({
      totals: zeroNutrients(), unknownMicroEntries: 0, unknownProteinEntries: 0, unknownFor: {},
    });
  });

  it('counts, per nutrient, the entries with no figure for it', () => {
    const crackers = {
      id: 'crackers', name: 'Crackers', category: 'other' as const,
      per100gRaw: { ...zeroNutrients(), kcal: 400, protein: 10 }, publishedYield: {},
      absorbsWater: false, source: 'user' as const, archived: false,
      unknownNutrients: ['potassium' as const, 'iron' as const],
    };
    const withCrackers: MealContext = { ...ctx, ingredientById: (id) => (id === 'crackers' ? crackers : ctx.ingredientById(id)) };
    const r = dayTotals([
      { id: 'a', profileId: 'p', date: '2026-10-06', label: 'lunch', createdAt: 1,
        kind: 'ingredient', ingredientId: 'crackers', method: 'asIs', cookedG: g(50) },
      { id: 'b', profileId: 'p', date: '2026-10-06', label: 'lunch', createdAt: 2,
        kind: 'quick', name: 'Kopi', kcal: 90, proteinG: 2 },
    ], withCrackers);
    expect(r.totals.kcal).toBe(290);
    expect(r.unknownMicroEntries).toBe(2);
    expect(r.unknownProteinEntries).toBe(0);
    expect(r.unknownFor.potassium).toBe(2);
    expect(r.unknownFor.carbs).toBe(1);
    expect(r.unknownFor.kcal).toBeUndefined();
  });
});

describe('validateEntry', () => {
  const draft = (over: Partial<MealEntryFields> = {}): MealEntryFields =>
    ({ kind: 'weight', cookSessionId: 's1', grams: g(100), ...over } as MealEntryFields);

  it('accepts an amount that fits in what is left', () => {
    expect(validateEntry(draft(), ctx, [], null).ok).toBe(true);
  });

  it('refuses more than remains, naming the remainder', () => {
    const result = validateEntry(draft({ kind: 'weight', cookSessionId: 's1', grams: g(300) }), ctx, [], null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('284g');
  });

  it('counts existing entries against the remainder', () => {
    const existing = [entry({ kind: 'weight', cookSessionId: 's1', grams: g(250) })];
    expect(validateEntry(draft(), ctx, existing, null).ok).toBe(false);
  });

  it('excludes the entry being edited from the remainder it is checked against', () => {
    const existing = [entry({ id: 'm1', kind: 'weight', cookSessionId: 's1', grams: g(250) })];
    // Growing 250g to 260g must be allowed: without excluding itself, 260 is compared
    // against the 34g left after its own 250g and is wrongly refused.
    const bigger = draft({ kind: 'weight', cookSessionId: 's1', grams: g(260) });
    expect(validateEntry(bigger, ctx, existing, 'm1').ok).toBe(true);
  });

  it('refuses a quick entry with no calories', () => {
    expect(validateEntry(draft({ kind: 'quick', name: 'Something', kcal: 0 }), ctx, [], null).ok).toBe(false);
  });

  it('refuses a quick entry with no name', () => {
    expect(validateEntry(draft({ kind: 'quick', name: '  ', kcal: 100 }), ctx, [], null).ok).toBe(false);
  });

  it('refuses an ingredient entry with no weight', () => {
    const d = draft({ kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(0) });
    expect(validateEntry(d, ctx, [], null).ok).toBe(false);
  });
});
