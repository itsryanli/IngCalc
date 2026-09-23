import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SORT,
  ingredientLookup, inRange, NO_LOCATION, nextSort, purchaseRows, rangeFileTag, sortRows, summarise,
  totalsByLocation, totalsByMonth, UNKNOWN_INGREDIENT,
  type CostRange, type PurchaseRow, type SortKey,
} from './costs';
import { zeroNutrients } from './nutrients';
import type { RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient } from './types';
import { g, myr } from './units';

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
