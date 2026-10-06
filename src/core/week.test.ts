import { describe, it, expect } from 'vitest';
import { bestValueBetween, milestones, spentBetween, summariseWeek, weekDays, yieldsLearned } from './week';
import { zeroNutrients } from './nutrients';
import { g, myr } from './units';
import type { Batch, DayLog, Ingredient, MealEntry } from './types';
import type { MealContext } from './meals';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const ctx: MealContext = {
  sessions: [], batches: [], ingredientById: () => undefined,
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION,
};
const quick = (date: string, kcal: number, proteinG: number): MealEntry => ({
  id: `${date}-${kcal}`, profileId: 'p', date, label: 'lunch', createdAt: 1,
  kind: 'quick', name: 'x', kcal, proteinG,
});
const log = (date: string, proteinG = 100, kcal = 2000): [string, DayLog] =>
  [date, { id: `p:${date}`, profileId: 'p', date, targets: { kcal, proteinG, micros: {} } }];

describe('weekDays and summariseWeek', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
  const days = weekDays(
    dates,
    [quick('2026-10-01', 1800, 120), quick('2026-10-03', 2200, 80)],
    new Map([log('2026-10-01'), log('2026-10-03')]),
    ctx,
  );

  it('marks each day logged or not, and whether protein was reached', () => {
    expect(days.map((d) => [d.logged, d.hitProtein])).toEqual([[true, true], [false, false], [true, false]]);
  });

  it('averages over logged days only, so a day off never drags the average to zero', () => {
    expect(summariseWeek(days)).toEqual({
      loggedDays: 2, proteinHits: 1, avgKcal: 2000, avgProtein: 100, avgKcalTarget: 2000, avgProteinTarget: 100,
    });
  });

  it('gives zeros, not NaN, for a week with nothing logged', () => {
    expect(summariseWeek(weekDays(dates, [], new Map(), ctx)).avgKcal).toBe(0);
  });
});

const tempeh: Ingredient = {
  id: 'tempeh', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false,
};
const buy = (id: string, date: string, priceRM: number, grams = 1000, location = 'Pasar'): Batch => ({
  id, ingredientId: 'tempeh', rawWeightG: g(grams),
  purchase: { pricePaidMYR: myr(priceRM), location, date }, createdAt: 1,
});

describe('spentBetween', () => {
  it('adds up purchases in the period, inclusive', () => {
    const batches = [buy('a', '2026-09-30', 5), buy('b', '2026-10-01', 7), buy('c', '2026-10-07', 3), buy('d', '2026-10-08', 9)];
    expect(spentBetween(batches, '2026-10-01', '2026-10-07')).toBe(10);
  });
});

describe('bestValueBetween', () => {
  const lookup = (id: string) => (id === 'tempeh' ? tempeh : undefined);

  it('finds the most protein per ringgit in the period, and says if it beats every earlier buy', () => {
    // 1 kg at 20 g/100 g = 200 g protein: RM10 -> 20 g/RM, RM8 -> 25 g/RM.
    const best = bestValueBetween([buy('old', '2026-09-01', 10), buy('new', '2026-10-02', 8, 1000, 'Jaya')], lookup, '2026-10-01', '2026-10-07');
    expect(best).toEqual({ name: 'Tempeh', location: 'Jaya', gramsPerMYR: 25, bestEver: true });
  });

  it('is not "best ever" when an earlier purchase was better value', () => {
    const best = bestValueBetween([buy('old', '2026-09-01', 5), buy('new', '2026-10-02', 8)], lookup, '2026-10-01', '2026-10-07');
    expect(best?.bestEver).toBe(false);
  });

  it('returns nothing when nothing was bought in the period', () => {
    expect(bestValueBetween([buy('old', '2026-09-01', 5)], lookup, '2026-10-01', '2026-10-07')).toBeNull();
  });
});

describe('yieldsLearned', () => {
  it('counts foods cooked with heat, and those with a usable measured yield', () => {
    const batches = [buy('a', '2026-10-01', 5), { ...buy('b', '2026-10-01', 5), ingredientId: 'chicken' }];
    const sample = (ingredientId: string, method: 'roasted' | 'asIs', excluded = false) =>
      ({ ingredientId, method, rawUsedG: g(100), cookedWeightG: g(80), excludeFromCalibration: excluded });
    expect(yieldsLearned(batches, [
      sample('tempeh', 'roasted'), sample('chicken', 'roasted', true), sample('banana', 'asIs'),
    ])).toEqual({ learned: 1, cooked: 2 });
  });
});

describe('milestones', () => {
  it('lists only what has been reached', () => {
    expect(milestones({ loggedDays: 3, weighedCooks: 0, backedUp: false })).toEqual([]);
    expect(milestones({ loggedDays: 31, weighedCooks: 12, backedUp: true })).toEqual([
      'A week of days logged', 'A month of days logged', 'First cook weighed', '10 cooks weighed', 'First backup made',
    ]);
  });
});
