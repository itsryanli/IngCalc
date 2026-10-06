import { describe, it, expect } from 'vitest';
import { recentIngredientIds } from './recent';
import { g, myr } from './units';
import type { Batch, CookSession, MealEntry } from './types';

const batch = (id: string, ingredientId: string, createdAt: number): Batch => ({
  id, ingredientId, rawWeightG: g(500),
  purchase: { pricePaidMYR: myr(10), location: '', date: '2026-10-01' }, createdAt,
});
const session = (id: string, batchId: string): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(500), cookedWeightG: g(400),
  cookedAt: '2026-10-01', portionCount: 2, excludeFromCalibration: false,
});
const base = { profileId: 'p', date: '2026-10-01', label: 'lunch' as const };

describe('recentIngredientIds', () => {
  it('orders what was bought and eaten, newest first, without repeats', () => {
    const entries: MealEntry[] = [
      { ...base, id: 'e1', createdAt: 30, kind: 'ingredient', ingredientId: 'banana', method: 'asIs', cookedG: g(100) },
      { ...base, id: 'e2', createdAt: 40, kind: 'portion', cookSessionId: 's1', portions: 1 },
      { ...base, id: 'e3', createdAt: 50, kind: 'quick', name: 'Teh tarik', kcal: 120 },
    ];
    const ids = recentIngredientIds(
      [batch('b1', 'chicken', 10), batch('b2', 'tofu', 20)], [session('s1', 'b1')], entries,
    );
    expect(ids).toEqual(['chicken', 'banana', 'tofu']);
  });

  it('stops at the limit', () => {
    const batches = ['a', 'b', 'c', 'd'].map((x, i) => batch(x, x, i));
    expect(recentIngredientIds(batches, [], [], 2)).toEqual(['d', 'c']);
  });

  it('skips a kitchen entry whose cook no longer exists', () => {
    const entries: MealEntry[] = [{ ...base, id: 'e', createdAt: 5, kind: 'weight', cookSessionId: 'gone', grams: g(50) }];
    expect(recentIngredientIds([], [], entries)).toEqual([]);
  });
});
