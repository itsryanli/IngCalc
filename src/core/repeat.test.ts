import { describe, it, expect } from 'vitest';
import { planRepeat, previousMeal } from './repeat';
import { zeroNutrients } from './nutrients';
import { g, myr } from './units';
import type { Batch, CookSession, Ingredient, MealEntry } from './types';
import type { MealContext } from './meals';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const banana: Ingredient = {
  id: 'banana', name: 'Banana', category: 'fruit', per100gRaw: { ...zeroNutrients(), kcal: 89 },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false,
};
const batch: Batch = {
  id: 'b1', ingredientId: 'banana', rawWeightG: g(400),
  purchase: { pricePaidMYR: myr(5), location: '', date: '2026-10-01' }, createdAt: 1,
};
const cook: CookSession = {
  id: 's1', batchId: 'b1', method: 'asIs', rawUsedG: g(400), cookedWeightG: g(400),
  cookedAt: '2026-10-01', portionCount: 4, excludeFromCalibration: false,
};
const ctx: MealContext = {
  sessions: [cook], batches: [batch], ingredientById: (id) => (id === 'banana' ? banana : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION,
};
const entry = (over: Partial<MealEntry> & Pick<MealEntry, 'id'>): MealEntry => ({
  profileId: 'p', date: '2026-10-04', label: 'breakfast', createdAt: 1,
  kind: 'quick', name: 'Kopi', kcal: 90, ...over,
} as MealEntry);

describe('previousMeal', () => {
  it('finds the most recent earlier day with this meal, for this person only', () => {
    const all = [
      entry({ id: 'a', date: '2026-10-02' }),
      entry({ id: 'b', date: '2026-10-04', createdAt: 2 }),
      entry({ id: 'c', date: '2026-10-04', createdAt: 1 }),
      entry({ id: 'd', date: '2026-10-05', profileId: 'someone-else' }),
      entry({ id: 'e', date: '2026-10-05', label: 'lunch' }),
      entry({ id: 'f', date: '2026-10-06' }),
    ];
    const r = previousMeal(all, 'p', 'breakfast', '2026-10-06');
    expect(r?.date).toBe('2026-10-04');
    expect(r?.entries.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('returns nothing when the meal was never logged before', () => {
    expect(previousMeal([entry({ id: 'a', date: '2026-10-06' })], 'p', 'breakfast', '2026-10-06')).toBeNull();
  });
});

describe('planRepeat', () => {
  const target = { profileId: 'p', date: '2026-10-06', label: 'breakfast' as const };

  it('copies quick and any-ingredient entries as they were', () => {
    const source = [
      entry({ id: 'q', kind: 'quick', name: 'Kopi', kcal: 90, proteinG: 2 }),
      entry({ id: 'i', kind: 'ingredient', ingredientId: 'banana', method: 'asIs', cookedG: g(120) }),
    ];
    const plan = planRepeat(source, ctx, source, target);
    expect(plan.fields).toEqual([
      { kind: 'quick', name: 'Kopi', kcal: 90, proteinG: 2 },
      { kind: 'ingredient', ingredientId: 'banana', method: 'asIs', cookedG: 120 },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('never copies more than a cook still holds, counting the copies themselves', () => {
    // 4 portions cooked, 3 eaten: a 2-portion breakfast cannot be repeated,
    // and two 1-portion entries can only be repeated once.
    const eaten = entry({ id: 'x', kind: 'portion', cookSessionId: 's1', portions: 1, date: '2026-10-03' });
    const source = [
      entry({ id: 'p1', kind: 'portion', cookSessionId: 's1', portions: 1 }),
      entry({ id: 'p2', kind: 'portion', cookSessionId: 's1', portions: 1 }),
    ];
    const plan = planRepeat(source, ctx, [eaten, ...source], target);
    expect(plan.fields).toHaveLength(1);
    expect(plan.skipped.map((s) => s.entry.id)).toEqual(['p2']);
  });
});
