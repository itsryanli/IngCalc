import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SORT,
  ingredientLookup, inRange, MEAL_CSV_HEADERS, mealCsvRows, NO_LOCATION, nextSort, purchaseRows, PURCHASE_CSV_HEADERS, purchaseCsvRows, rangeFileTag, sortRows, summarise,
  totalsByLocation, totalsByMonth, UNKNOWN_INGREDIENT, UNKNOWN_PROFILE,
  type CostRange, type PurchaseRow, type SortKey,
} from './costs';
import { zeroNutrients } from './nutrients';
import type { RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient } from './types';
import { g, myr } from './units';
import { CATEGORY_YIELD } from '../data/categoryYield';
import type { MealContext } from './meals';
import type { MealEntry } from './types';

export const ingredient = (id: string, name: string, protein: number, over: Partial<Ingredient> = {}): Ingredient => ({
  id, name, category: 'meat', per100gRaw: { ...zeroNutrients(), protein },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false, ...over,
});

const batch = (id: string, over: Partial<Batch> & { price?: number; date?: string; location?: string } = {}): Batch => {
  const { price = 20, date = '2026-09-19', location = 'Pasar', ...rest } = over;
  return {
    id, ingredientId: 'chicken', rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(price), location, date }, createdAt: 0, ...rest,
  };
};

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false, ...over,
});

const CHICKEN = ingredient('chicken', 'Chicken', 22.5);
const KANGKUNG = ingredient('kangkung', 'Kangkung', 2.6, { category: 'vegetable' });
const RETENTION: RetentionLookup = { meat: { roasted: { protein: 0.9 } } };
const lookup = ingredientLookup([CHICKEN, KANGKUNG], []);

describe('inRange', () => {
  const today = '2026-09-23';
  it.each<[string, CostRange, boolean]>([
    ['2026-09-01', 'thisMonth', true],
    ['2026-09-30', 'thisMonth', true],
    ['2026-08-31', 'thisMonth', false],
    ['2026-07-01', 'last3Months', true],
    ['2026-06-30', 'last3Months', false],
    ['2026-10-01', 'last3Months', false],
    ['2026-01-01', 'thisYear', true],
    ['2025-12-31', 'thisYear', false],
    ['1999-01-01', 'all', true],
  ])('%s in %s is %s', (date, range, expected) => {
    expect(inRange(date, range, today)).toBe(expected);
  });

  it('reaches back across the year boundary for the last three months', () => {
    expect(inRange('2025-11-01', 'last3Months', '2026-01-15')).toBe(true);
    expect(inRange('2025-12-31', 'last3Months', '2026-01-15')).toBe(true);
    expect(inRange('2025-10-31', 'last3Months', '2026-01-15')).toBe(false);
  });
});

describe('rangeFileTag', () => {
  it.each<[CostRange, string, string]>([
    ['thisMonth', '2026-09-23', '2026-09'],
    ['last3Months', '2026-09-23', '2026-07-to-2026-09'],
    ['last3Months', '2026-01-15', '2025-11-to-2026-01'],
    ['thisYear', '2026-09-23', '2026'],
    ['all', '2026-09-23', 'all'],
  ])('%s on %s is %s', (range, today, expected) => {
    expect(rangeFileTag(range, today)).toBe(expected);
  });
});

describe('ingredientLookup', () => {
  it('resolves an archived user ingredient, which the picker catalogue hides', () => {
    const tempeh = ingredient('u-tempeh', 'Tempeh', 20, { source: 'user', archived: true });
    expect(ingredientLookup([CHICKEN], [tempeh])('u-tempeh')?.name).toBe('Tempeh');
  });

  it('lets a user ingredient shadow a bundled one with the same id', () => {
    const mine = ingredient('chicken', 'My chicken', 20, { source: 'user' });
    expect(ingredientLookup([CHICKEN], [mine])('chicken')?.name).toBe('My chicken');
  });
});

describe('purchaseRows', () => {
  it('takes every figure from cost.ts', () => {
    const [row] = purchaseRows([batch('b1')], [session('s1', 'b1')], lookup, RETENTION);
    expect(row).toMatchObject({
      batchId: 'b1', date: '2026-09-19', ingredient: 'Chicken', location: 'Pasar',
      rawWeightG: 1000, priceMYR: 20, myrPerKgRaw: 20, proteinRawG: 225,
      proteinPerMYRRaw: 11.25, cookedG: 284,
    });
    // RM8 attributable over 0.284kg cooked.
    expect(row!.myrPerKgCooked).toBeCloseTo(8 / 0.284, 10);
    // 400g raw × 22.5% protein × 0.9 retained, over RM8.
    expect(row!.proteinPerMYRCooked).toBeCloseTo(10.125, 10);
  });

  it('leaves the cooked figures null for a batch never cooked', () => {
    const [row] = purchaseRows([batch('b1')], [], lookup, RETENTION);
    expect(row).toMatchObject({ cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null });
  });

  it('keeps a batch whose ingredient cannot be resolved, with no protein figures', () => {
    const [row] = purchaseRows([batch('b1', { ingredientId: 'gone' })], [], lookup, RETENTION);
    expect(row).toMatchObject({
      ingredient: UNKNOWN_INGREDIENT, priceMYR: 20, proteinRawG: null, proteinPerMYRRaw: null,
    });
  });

  it('orders rows newest-created first', () => {
    const rows = purchaseRows(
      [batch('old', { createdAt: 1 }), batch('new', { createdAt: 2 })], [], lookup, RETENTION,
    );
    expect(rows.map((r) => r.batchId)).toEqual(['new', 'old']);
  });
});

describe('summarise', () => {
  it('weights protein per RM by spend rather than averaging the rows', () => {
    // Chicken: 225g protein for RM20 (11.25/RM). Kangkung: 13g for RM2 (6.5/RM).
    // Weighted: 238 / 22 = 10.82. The mean of the rows would be 8.875.
    const rows = purchaseRows(
      [batch('c'), batch('k', { ingredientId: 'kangkung', rawWeightG: g(500), price: 2 })],
      [], lookup, RETENTION,
    );
    const s = summarise(rows);
    expect(s.spentMYR).toBe(22);
    expect(s.count).toBe(2);
    expect(s.proteinPerMYR).toBeCloseTo(238 / 22, 10);
  });

  it('counts an unresolvable purchase in the spend but not in the protein ratio', () => {
    const rows = purchaseRows([batch('c'), batch('x', { ingredientId: 'gone', price: 5 })], [], lookup, RETENTION);
    const s = summarise(rows);
    expect(s.spentMYR).toBe(25);
    expect(s.proteinPerMYR).toBeCloseTo(11.25, 10);
  });

  it('has no protein ratio when nothing was spent', () => {
    expect(summarise([]).proteinPerMYR).toBeNull();
    expect(summarise(purchaseRows([batch('c', { price: 0 })], [], lookup, RETENTION)).proteinPerMYR).toBeNull();
  });
});

const row = (id: string, over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  batchId: id, date: '2026-09-19', ingredient: 'Chicken', location: 'Pasar',
  rawWeightG: g(1000), priceMYR: myr(20), myrPerKgRaw: myr(20), proteinRawG: 225,
  proteinPerMYRRaw: 11.25, cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null,
  ...over,
});
const ids = (rows: readonly PurchaseRow[]) => rows.map((r) => r.batchId);

describe('nextSort', () => {
  it('reverses the active column', () => {
    expect(nextSort({ key: 'priceMYR', dir: 'desc' }, 'priceMYR')).toEqual({ key: 'priceMYR', dir: 'asc' });
  });
  it('starts a new number or date column descending and a text column ascending', () => {
    expect(nextSort(DEFAULT_SORT, 'priceMYR')).toEqual({ key: 'priceMYR', dir: 'desc' });
    expect(nextSort(DEFAULT_SORT, 'ingredient')).toEqual({ key: 'ingredient', dir: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'location')).toEqual({ key: 'location', dir: 'asc' });
  });
  it('defaults to newest first', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'date', dir: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [
    row('a', { date: '2026-09-02', ingredient: 'banana', location: 'Tesco', priceMYR: myr(5), proteinPerMYRCooked: 3 }),
    row('b', { date: '2026-09-01', ingredient: 'Apple', location: '', priceMYR: myr(9), proteinPerMYRCooked: null }),
    row('c', { date: '2026-09-03', ingredient: 'cherry', location: 'aeon', priceMYR: myr(1), proteinPerMYRCooked: 7 }),
  ];

  const cases: [SortKey, string[], string[]][] = [
    ['date', ['b', 'a', 'c'], ['c', 'a', 'b']],
    ['ingredient', ['b', 'a', 'c'], ['c', 'a', 'b']],
    ['priceMYR', ['c', 'a', 'b'], ['b', 'a', 'c']],
    // Nulls last in BOTH directions.
    ['proteinPerMYRCooked', ['a', 'c', 'b'], ['c', 'a', 'b']],
    // A blank location renders as — and sorts like a null.
    ['location', ['c', 'a', 'b'], ['a', 'c', 'b']],
  ];
  it.each(cases)('sorts by %s both ways', (key, asc, desc) => {
    expect(ids(sortRows(rows, { key, dir: 'asc' }))).toEqual(asc);
    expect(ids(sortRows(rows, { key, dir: 'desc' }))).toEqual(desc);
  });

  it('compares text ignoring case', () => {
    expect(ids(sortRows([row('x', { ingredient: 'b' }), row('y', { ingredient: 'A' })], { key: 'ingredient', dir: 'asc' })))
      .toEqual(['y', 'x']);
  });

  it('keeps ties in their incoming order, in either direction', () => {
    const tied = [row('1'), row('2'), row('3')];
    expect(ids(sortRows(tied, { key: 'date', dir: 'asc' }))).toEqual(['1', '2', '3']);
    expect(ids(sortRows(tied, { key: 'date', dir: 'desc' }))).toEqual(['1', '2', '3']);
  });

  it('does not mutate its input', () => {
    const input = [row('a', { priceMYR: myr(1) }), row('b', { priceMYR: myr(2) })];
    sortRows(input, { key: 'priceMYR', dir: 'desc' });
    expect(ids(input)).toEqual(['a', 'b']);
  });
});

describe('totalsByLocation', () => {
  it('folds case and whitespace, labels with the most recent spelling, and ranks by spend', () => {
    const totals = totalsByLocation([
      row('1', { location: 'tesco ', date: '2026-09-01', priceMYR: myr(10) }),
      row('2', { location: 'Tesco', date: '2026-09-05', priceMYR: myr(5) }),
      row('3', { location: 'Pasar', date: '2026-09-02', priceMYR: myr(30) }),
    ]);
    expect(totals).toEqual([
      { key: 'pasar', label: 'Pasar', count: 1, spentMYR: 30, share: 30 / 45 },
      { key: 'tesco', label: 'Tesco', count: 2, spentMYR: 15, share: 15 / 45 },
    ]);
  });

  it('breaks a same-date spelling tie in favour of the row seen first', () => {
    const [t] = totalsByLocation([
      row('1', { location: 'AEON', date: '2026-09-05' }),
      row('2', { location: 'aeon', date: '2026-09-05' }),
    ]);
    expect(t!.label).toBe('AEON');
  });

  it('groups blank locations under No location', () => {
    const [t] = totalsByLocation([row('1', { location: '' }), row('2', { location: '   ' })]);
    expect(t).toMatchObject({ label: NO_LOCATION, count: 2 });
  });

  it('gives every share as zero when nothing was spent', () => {
    expect(totalsByLocation([row('1', { priceMYR: myr(0) })])[0]!.share).toBe(0);
  });

  it('orders equal spends by label', () => {
    const totals = totalsByLocation([row('1', { location: 'Zed' }), row('2', { location: 'Abe' })]);
    expect(totals.map((t) => t.label)).toEqual(['Abe', 'Zed']);
  });
});

describe('totalsByMonth', () => {
  it('groups by month, newest first, with readable labels', () => {
    const totals = totalsByMonth([
      row('1', { date: '2026-08-30', priceMYR: myr(4) }),
      row('2', { date: '2026-09-01', priceMYR: myr(6) }),
      row('3', { date: '2026-09-20', priceMYR: myr(10) }),
    ]);
    expect(totals.map(({ key, label, count, spentMYR }) => ({ key, label, count, spentMYR }))).toEqual([
      { key: '2026-09', label: 'Sep 2026', count: 2, spentMYR: 16 },
      { key: '2026-08', label: 'Aug 2026', count: 1, spentMYR: 4 },
    ]);
  });
});

describe('purchaseCsvRows', () => {
  it('has the documented header', () => {
    expect(PURCHASE_CSV_HEADERS).toEqual([
      'date', 'ingredient', 'location', 'raw_weight_g', 'price_myr', 'myr_per_kg_raw',
      'protein_g_per_myr_raw', 'cooked_g', 'myr_per_kg_cooked', 'protein_g_per_myr_cooked',
      'batch_id',
    ]);
  });

  it('rounds each figure and writes missing ones as null', () => {
    const [r] = purchaseCsvRows([row('b1', {
      rawWeightG: g(1000.04), priceMYR: myr(18.499), myrPerKgRaw: myr(18.499),
      proteinPerMYRRaw: 12.1666, cookedG: g(284.06), myrPerKgCooked: myr(28.1690),
      proteinPerMYRCooked: null,
    })]);
    expect(r).toEqual([
      '2026-09-19', 'Chicken', 'Pasar', 1000, 18.5, 18.5, 12.17, 284.1, 28.17, null, 'b1',
    ]);
  });

  it('keeps the order it is given', () => {
    const rows = purchaseCsvRows([row('z'), row('a')]);
    expect(rows.map((r) => r.at(-1))).toEqual(['z', 'a']);
  });
});

describe('mealCsvRows', () => {
  // 400g chicken (22.5g protein, 120 kcal /100g) roasted to 284g in 4 portions.
  // No retention, so one portion (71g) is exactly a quarter: 22.5g protein, 120 kcal.
  const chicken = ingredient('chicken', 'Chicken', 22.5, {
    per100gRaw: { ...zeroNutrients(), protein: 22.5, kcal: 120 },
  });
  const b = batch('b1');
  const s = session('s1', 'b1');
  const ctx: MealContext = {
    sessions: [s], batches: [b], ingredientById: ingredientLookup([chicken], []),
    samples: [], categoryYield: CATEGORY_YIELD, retention: {},
  };
  const base = { profileId: 'p1', date: '2026-09-19', label: 'lunch' as const, createdAt: 0 };
  const names = {
    profileName: (id: string) => ({ p1: 'Ali', p2: 'Bee' } as Record<string, string>)[id],
    itemName: (e: MealEntry) => `item:${e.id}`,
  };

  it('has the documented header', () => {
    expect(MEAL_CSV_HEADERS).toEqual([
      'date', 'profile', 'meal', 'kind', 'item', 'cooked_g', 'portions', 'kcal', 'protein_g',
      'cost_myr', 'batch_id',
    ]);
  });

  it('writes a portion entry with grams, nutrients, cost and its batch', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'e1', kind: 'portion', cookSessionId: 's1', portions: 1 }], ctx, names,
    );
    expect(r).toEqual(['2026-09-19', 'Ali', 'lunch', 'portion', 'item:e1', 71, 1, 120, 22.5, 2, 'b1']);
  });

  it('writes a weighed entry with no portion count', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'e1', kind: 'weight', cookSessionId: 's1', grams: g(142) }], ctx, names,
    );
    expect(r).toEqual(['2026-09-19', 'Ali', 'lunch', 'weight', 'item:e1', 142, null, 240, 45, 4, 'b1']);
  });

  it('leaves cost and batch empty for entries with no purchase behind them', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'i1', kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(100) }],
      ctx, names,
    );
    expect(r!.slice(5, 7)).toEqual([100, null]);
    expect(r!.slice(9)).toEqual([null, null]);
  });

  it('leaves protein empty, not zero, for a quick entry with no protein figure', () => {
    const [withP, without] = mealCsvRows([
      { ...base, id: 'q1', kind: 'quick', name: 'Teh', kcal: 90, proteinG: 3 },
      { ...base, id: 'q2', kind: 'quick', name: 'Kuih', kcal: 150, createdAt: 1 },
    ], ctx, names);
    expect(withP!.slice(5)).toEqual([null, null, 90, 3, null, null]);
    expect(without!.slice(5)).toEqual([null, null, 150, null, null, null]);
  });

  it('orders by date, then profile name, then meal slot, then creation', () => {
    const rows = mealCsvRows([
      { ...base, id: 'late', date: '2026-09-20', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'bee', profileId: 'p2', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'dinner', label: 'dinner', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'lunch2', createdAt: 2, kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'breakfast', label: 'breakfast', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'lunch1', createdAt: 1, kind: 'quick', name: 'x', kcal: 1 },
    ], ctx, names);
    expect(rows.map((r) => r[4])).toEqual([
      'item:breakfast', 'item:lunch1', 'item:lunch2', 'item:dinner', 'item:bee', 'item:late',
    ]);
  });

  it('names an unresolvable profile rather than dropping the row', () => {
    const [r] = mealCsvRows([{ ...base, id: 'q', profileId: 'gone', kind: 'quick', name: 'x', kcal: 1 }], ctx, names);
    expect(r![1]).toBe(UNKNOWN_PROFILE);
  });
});
