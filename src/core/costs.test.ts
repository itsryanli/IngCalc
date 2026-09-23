import { describe, it, expect } from 'vitest';
import {
  ingredientLookup, inRange, purchaseRows, rangeFileTag, summarise, UNKNOWN_INGREDIENT,
  type CostRange,
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
