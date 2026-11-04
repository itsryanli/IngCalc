import { describe, it, expect } from 'vitest';
import {
  bestValueBetween, milestones, mondayOf, savingsBetween, spentBetween, summariseWeek, varietyBetween,
  weekDays, weeklyStreak, yieldsLearned,
} from './week';
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

describe('mondayOf', () => {
  it('finds the Monday of the week, across a month boundary', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02'); // a Wednesday
    expect(mondayOf('2026-11-02')).toBe('2026-11-02'); // a Monday
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // a Sunday
  });
});

describe('weeklyStreak', () => {
  // Weeks starting Mon 19, 26 Oct and 2 Nov 2026.
  const fourDays = (monday: string) => [0, 1, 3, 5].map((i) =>
    `2026-${monday.slice(5, 7)}-${String(Number(monday.slice(8)) + i).padStart(2, '0')}`);

  it('counts weeks in a row with 4+ logged days, this week included once it counts', () => {
    const s = weeklyStreak([...fourDays('2026-10-19'), ...fourDays('2026-10-26'), '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], '2026-11-05');
    expect(s).toMatchObject({ weeks: 3, thisWeekCounts: true, needed: 0 });
  });

  it('does not break on a missed day, and leaves this week open while it can still count', () => {
    // Nothing logged yet on Wednesday 4 Nov: last two weeks still stand.
    const s = weeklyStreak([...fourDays('2026-10-19'), ...fourDays('2026-10-26'), '2026-11-02'], '2026-11-04');
    expect(s).toEqual({ weeks: 2, thisWeekLogged: 1, thisWeekCounts: false, needed: 3, reachable: true });
  });

  it('ends at a week with fewer than 4 days', () => {
    const s = weeklyStreak([...fourDays('2026-10-19').slice(0, 3), ...fourDays('2026-10-26')], '2026-11-02');
    expect(s.weeks).toBe(1);
  });

  it('knows when the days left this week are too few', () => {
    // Saturday with one day logged: Saturday and Sunday make 3 at most.
    expect(weeklyStreak(['2026-11-02'], '2026-11-07')).toMatchObject({ needed: 3, reachable: false });
    // Today itself still counts as a day left.
    expect(weeklyStreak(['2026-11-02', '2026-11-03'], '2026-11-07').reachable).toBe(true);
  });

  it('is zero with nothing logged', () => {
    expect(weeklyStreak([], '2026-11-04')).toMatchObject({ weeks: 0, thisWeekLogged: 0 });
  });
});

describe('varietyBetween', () => {
  const food = (id: string, category: Ingredient['category'], kcal = 100, extra: Partial<Ingredient> = {}): Ingredient => ({
    id, name: id[0]!.toUpperCase() + id.slice(1), category, per100gRaw: { ...zeroNutrients(), kcal },
    publishedYield: {}, absorbsWater: false, source: 'usda', archived: false, ...extra,
  });
  const foods = [
    food('rice', 'grain'), food('chicken', 'meat'), food('kangkung', 'vegetable'),
    food('water', 'other', 0), food('tempeh', 'legume'),
    food('bread', 'other', 250, {
      source: 'user',
      recipe: { items: [{ ingredientId: 'flour', grams: g(500) }, { ingredientId: 'water', grams: g(300) }], finishedWeightG: g(750) },
    }),
    food('flour', 'grain'),
  ];
  const vctx: MealContext = { ...ctx, ingredientById: (id) => foods.find((f) => f.id === id) };
  let n = 0;
  const ate = (date: string, ingredientId: string): MealEntry => ({
    id: `e${n++}`, profileId: 'p', date, label: 'lunch', createdAt: n,
    kind: 'ingredient', ingredientId, method: 'asIs', cookedG: g(100),
  });

  it('counts different foods and plants, a dish by what went in, and not water or quick adds', () => {
    const v = varietyBetween([
      ate('2026-11-01', 'rice'), ate('2026-11-02', 'rice'), ate('2026-11-02', 'chicken'),
      ate('2026-11-03', 'bread'), ate('2026-11-03', 'water'), quick('2026-11-03', 500, 20),
    ], vctx, '2026-11-01', '2026-11-07');
    // rice, chicken, flour (from the bread); water has no calories.
    expect(v).toEqual({ foods: 3, plants: 2, newFoods: [] });
  });

  it('names foods not eaten in the four weeks before, but not on a first week', () => {
    const entries = [ate('2026-10-20', 'rice'), ate('2026-11-02', 'rice'), ate('2026-11-03', 'tempeh'), ate('2026-11-04', 'kangkung')];
    expect(varietyBetween(entries, vctx, '2026-11-01', '2026-11-07').newFoods).toEqual(['Tempeh', 'Kangkung']);
    expect(varietyBetween(entries.slice(1), vctx, '2026-11-01', '2026-11-07').newFoods).toEqual([]);
  });

  it('counts a cooked portion through its batch', () => {
    const batch = { ...buy('b', '2026-10-30', 10), ingredientId: 'chicken' };
    const session = { id: 's', batchId: 'b', method: 'boiled' as const, rawUsedG: g(500), cookedWeightG: g(400), cookedAt: '2026-10-30', portionCount: 4, excludeFromCalibration: false };
    const portion: MealEntry = { id: 'x', profileId: 'p', date: '2026-11-02', label: 'dinner', createdAt: 1, kind: 'portion', cookSessionId: 's', portions: 1 };
    expect(varietyBetween([portion], { ...vctx, batches: [batch], sessions: [session] }, '2026-11-01', '2026-11-07').foods).toBe(1);
  });
});

describe('savingsBetween', () => {
  const lookup = (id: string) => (id === 'tempeh' ? tempeh : undefined);

  it('compares with your own usual price per kilo, weighted by weight', () => {
    // Before: RM10 for 1 kg and RM30 for 2 kg -> RM40 / 3 kg. Now 1.5 kg for RM15: usual RM20, saved RM5.
    const s = savingsBetween([
      buy('a', '2026-09-01', 10, 1000), buy('b', '2026-09-15', 30, 2000), buy('c', '2026-10-02', 15, 1500, 'Jaya'),
    ], lookup, '2026-10-01', '2026-10-07');
    expect(s?.savedMYR).toBeCloseTo(5);
    expect(s?.compared).toBe(1);
    expect(s?.bestDeal).toEqual({ name: 'Tempeh', location: 'Jaya', fractionBelow: 0.25 });
  });

  it('goes negative when it cost more, with no deal to name', () => {
    const s = savingsBetween([buy('a', '2026-09-01', 10), buy('b', '2026-10-02', 12)], lookup, '2026-10-01', '2026-10-07');
    expect(s?.savedMYR).toBeCloseTo(-2);
    expect(s?.bestDeal).toBeNull();
  });

  it('is null with nothing earlier to compare, and ignores free purchases', () => {
    expect(savingsBetween([buy('b', '2026-10-02', 12)], lookup, '2026-10-01', '2026-10-07')).toBeNull();
    expect(savingsBetween([buy('a', '2026-09-01', 0), buy('b', '2026-10-02', 12)], lookup, '2026-10-01', '2026-10-07')).toBeNull();
  });
});
