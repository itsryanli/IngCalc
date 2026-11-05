import { proteinPerMYRRaw } from './cost';
import { UNKNOWN_INGREDIENT } from './costs';
import { dayTotals, type MealContext } from './meals';
import {
  NOT_COOKED,
  type Batch, type Category, type DayLog, type Ingredient, type IsoDate, type MealEntry, type YieldSample,
} from './types';

/**
 * The week view: how the last seven days went, and a few gentle signs of
 * progress. Deliberately nothing that rewards eating less or punishes a missed
 * day: a day not logged is simply a day not logged. The one thing that can
 * end is the weekly streak, and only a whole week with too few logged days
 * ends it, never a single day off.
 */

export interface WeekDay {
  date: IsoDate;
  logged: boolean;
  kcal: number;
  protein: number;
  /** The day's frozen targets; absent on a day with nothing logged. */
  kcalTarget?: number;
  proteinTarget?: number;
  hitProtein: boolean;
}

export function weekDays(
  dates: readonly IsoDate[],
  entries: readonly MealEntry[],
  dayLogs: ReadonlyMap<IsoDate, DayLog>,
  ctx: MealContext,
): WeekDay[] {
  return dates.map((date) => {
    const mine = entries.filter((e) => e.date === date);
    const log = dayLogs.get(date);
    if (mine.length === 0 || log === undefined) {
      return { date, logged: false, kcal: 0, protein: 0, hitProtein: false };
    }
    const { totals } = dayTotals(mine, ctx);
    return {
      date, logged: true, kcal: totals.kcal, protein: totals.protein,
      kcalTarget: log.targets.kcal, proteinTarget: log.targets.proteinG,
      hitProtein: log.targets.proteinG > 0 && totals.protein >= log.targets.proteinG,
    };
  });
}

export interface WeekSummary {
  loggedDays: number;
  proteinHits: number;
  /** Averages over the days actually logged, so an unlogged day never drags them to zero. */
  avgKcal: number;
  avgProtein: number;
  avgKcalTarget: number;
  avgProteinTarget: number;
}

export function summariseWeek(days: readonly WeekDay[]): WeekSummary {
  const logged = days.filter((d) => d.logged);
  const avg = (f: (d: WeekDay) => number) =>
    logged.length === 0 ? 0 : logged.reduce((s, d) => s + f(d), 0) / logged.length;
  return {
    loggedDays: logged.length,
    proteinHits: logged.filter((d) => d.hitProtein).length,
    avgKcal: avg((d) => d.kcal),
    avgProtein: avg((d) => d.protein),
    avgKcalTarget: avg((d) => d.kcalTarget ?? 0),
    avgProteinTarget: avg((d) => d.proteinTarget ?? 0),
  };
}

const between = (date: IsoDate, from: IsoDate, to: IsoDate) => date >= from && date <= to;

/** What was spent on shopping between two dates, inclusive. */
export function spentBetween(batches: readonly Batch[], from: IsoDate, to: IsoDate): number {
  return batches
    .filter((b) => between(b.purchase.date, from, to))
    .reduce((sum, b) => sum + b.purchase.pricePaidMYR, 0);
}

export interface BestValue {
  name: string;
  location: string;
  gramsPerMYR: number;
  /** True when no purchase before this period gave more protein per ringgit. */
  bestEver: boolean;
}

/** The purchase in the period that bought the most protein per ringgit. */
export function bestValueBetween(
  batches: readonly Batch[],
  ingredientById: (id: string) => Ingredient | undefined,
  from: IsoDate,
  to: IsoDate,
): BestValue | null {
  const valued = batches.flatMap((b) => {
    const ingredient = ingredientById(b.ingredientId);
    const value = ingredient === undefined ? null : proteinPerMYRRaw(b, ingredient);
    return ingredient === undefined || value === null || value <= 0 ? [] : [{ b, ingredient, value }];
  });
  const inPeriod = valued.filter((v) => between(v.b.purchase.date, from, to));
  if (inPeriod.length === 0) return null;
  const best = inPeriod.reduce((a, c) => (c.value > a.value ? c : a));
  const before = valued.filter((v) => v.b.purchase.date < from);
  return {
    name: best.ingredient.name,
    location: best.b.purchase.location.trim(),
    gramsPerMYR: best.value,
    bestEver: before.every((v) => v.value < best.value),
  };
}

/**
 * How many of the foods the person cooks now use their own measured yield
 * rather than a rough category estimate. Each weighed cook makes the numbers
 * truer, which is the habit worth encouraging.
 */
export function yieldsLearned(
  batches: readonly Batch[],
  samples: readonly YieldSample[],
): { learned: number; cooked: number } {
  const heated = samples.filter((s) => s.method !== NOT_COOKED && s.rawUsedG > 0);
  const cooked = new Set(heated.map((s) => s.ingredientId));
  const learned = new Set(heated.filter((s) => !s.excludeFromCalibration).map((s) => s.ingredientId));
  // Only ingredients still in the kitchen's history count, so a deleted batch
  // cannot leave a food "cooked" that nobody can see.
  const known = new Set(batches.map((b) => b.ingredientId));
  return {
    learned: [...learned].filter((id) => known.has(id)).length,
    cooked: [...cooked].filter((id) => known.has(id)).length,
  };
}

export interface MilestoneInput {
  /** Distinct days this person has logged anything. */
  loggedDays: number;
  /** Cooks with a weighed cooked weight (not "as is"). */
  weighedCooks: number;
  backedUp: boolean;
}

/** Quiet, one-off markers of real habits. No points, no levels, nothing that resets. */
export function milestones({ loggedDays, weighedCooks, backedUp }: MilestoneInput): string[] {
  const out: string[] = [];
  if (loggedDays >= 7) out.push('A week of days logged');
  if (loggedDays >= 30) out.push('A month of days logged');
  if (weighedCooks >= 1) out.push('First cook weighed');
  if (weighedCooks >= 10) out.push('10 cooks weighed');
  if (backedUp) out.push('First backup made');
  return out;
}

/*
 * Calendar-day arithmetic on the date's text, worked through UTC midnight.
 * Both ends are UTC, so no local time zone or daylight-saving change can move
 * a day; `core/` cannot use `ui/dates`.
 */
const DAY_MS = 86_400_000;
const utcMs = (iso: IsoDate): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const addDays = (iso: IsoDate, days: number): IsoDate =>
  new Date(utcMs(iso) + days * DAY_MS).toISOString().slice(0, 10);

/** The Monday that starts the week holding this date. Weeks run Monday to Sunday. */
export const mondayOf = (iso: IsoDate): IsoDate =>
  addDays(iso, -((new Date(utcMs(iso)).getUTCDay() + 6) % 7));

/** Logged days a week needs to count towards the streak. */
export const STREAK_DAYS = 4;

export interface WeeklyStreak {
  /**
   * Weeks in a row with at least `STREAK_DAYS` logged days: up to and
   * including this week if it already counts, otherwise up to last week, since
   * a week still in progress has not missed anything yet.
   */
  weeks: number;
  thisWeekLogged: number;
  thisWeekCounts: boolean;
  /** Logged days still needed this week; 0 once it counts. */
  needed: number;
  /** Whether the days left in this week, today included, are enough to get there. */
  reachable: boolean;
}

/**
 * A forgiving streak: a missed day never breaks it, only a whole week with
 * fewer than `STREAK_DAYS` days logged. `today` is the day being viewed.
 */
export function weeklyStreak(loggedDates: Iterable<IsoDate>, today: IsoDate): WeeklyStreak {
  const logged = new Set(loggedDates);
  const loggedIn = (monday: IsoDate): number =>
    Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => logged.has(d)).length;

  const monday = mondayOf(today);
  const thisWeekLogged = loggedIn(monday);
  const thisWeekCounts = thisWeekLogged >= STREAK_DAYS;
  const sunday = addDays(monday, 6);
  let open = 0;
  for (let d = today; d <= sunday; d = addDays(d, 1)) if (!logged.has(d)) open += 1;
  const needed = Math.max(0, STREAK_DAYS - thisWeekLogged);

  let weeks = thisWeekCounts ? 1 : 0;
  // Ends at the first week that fell short, which at the latest is the week
  // before anything was logged.
  for (let m = addDays(monday, -7); loggedIn(m) >= STREAK_DAYS; m = addDays(m, -7)) weeks += 1;

  return { weeks, thisWeekLogged, thisWeekCounts, needed, reachable: needed <= open };
}

/** The categories that count as plants for variety: the "eat more plants" habit. */
export const PLANT_CATEGORIES: readonly Category[] = ['vegetable', 'fruit', 'grain', 'legume', 'nut'];

/** How far back a food must not have been eaten for it to count as new. */
export const NEW_FOOD_LOOKBACK_DAYS = 28;

export interface Variety {
  /** Different foods eaten. */
  foods: number;
  /** How many of those are plants (`PLANT_CATEGORIES`). */
  plants: number;
  /**
   * Names of foods eaten in the period but not in the `NEW_FOOD_LOOKBACK_DAYS`
   * before it, in the order first eaten. Empty when nothing was logged before
   * the period, or every food would be "new" on a first week.
   */
  newFoods: string[];
}

/** What an ingredient puts on the plate: itself, or for a dish, what went into it. */
function foodsIn(ingredient: Ingredient, ctx: MealContext, seen: Set<string>): Ingredient[] {
  if (ingredient.recipe === undefined) return [ingredient];
  if (seen.has(ingredient.id)) return [];
  seen.add(ingredient.id);
  return ingredient.recipe.items.flatMap((item) => {
    const inner = ctx.ingredientById(item.ingredientId);
    return inner === undefined ? [] : foodsIn(inner, ctx, seen);
  });
}

/**
 * The foods one entry put on the plate. A quick add names no food. Water and
 * salt carry no energy and are not food variety, so anything without calories
 * is left out.
 */
function foodsOfEntry(entry: MealEntry, ctx: MealContext): Ingredient[] {
  if (entry.kind === 'quick') return [];
  let ingredient: Ingredient | undefined;
  if (entry.kind === 'ingredient') {
    ingredient = ctx.ingredientById(entry.ingredientId);
  } else {
    const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
    const batch = session === undefined ? undefined : ctx.batches.find((b) => b.id === session.batchId);
    ingredient = batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId);
  }
  return ingredient === undefined ? [] : foodsIn(ingredient, ctx, new Set()).filter((i) => i.per100gRaw.kcal > 0);
}

/** How varied the eating was between two dates, inclusive. Pass one person's entries. */
export function varietyBetween(
  entries: readonly MealEntry[],
  ctx: MealContext,
  from: IsoDate,
  to: IsoDate,
): Variety {
  const eaten = new Map<string, Ingredient>();
  [...entries]
    .filter((e) => between(e.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .forEach((e) => { for (const i of foodsOfEntry(e, ctx)) if (!eaten.has(i.id)) eaten.set(i.id, i); });

  const earlierEntries = entries.filter((e) =>
    between(e.date, addDays(from, -NEW_FOOD_LOOKBACK_DAYS), addDays(from, -1)));
  const earlier = new Set(earlierEntries.flatMap((e) => foodsOfEntry(e, ctx).map((i) => i.id)));
  const foods = [...eaten.values()];

  return {
    foods: foods.length,
    plants: foods.filter((i) => PLANT_CATEGORIES.includes(i.category)).length,
    newFoods: earlierEntries.length === 0 ? [] : foods.filter((i) => !earlier.has(i.id)).map((i) => i.name),
  };
}

/** A find worth naming: at least this far under the usual price. */
export const DEAL_MIN_FRACTION = 0.05;

export interface Savings {
  /**
   * What the period's purchases would have cost at the person's own usual
   * price per kilo, minus what was paid. Negative when it cost more.
   */
  savedMYR: number;
  /** Purchases that had an earlier price to compare with. */
  compared: number;
  /** The purchase furthest under its usual price, when at least `DEAL_MIN_FRACTION` under. */
  bestDeal: { name: string; location: string; fractionBelow: number } | null;
}

/**
 * Prices paid in the period against the person's own usual price for the same
 * ingredient: everything paid for it before the period, per kilo, weighted by
 * weight. Free or weightless purchases are left out on both sides, since a
 * price per kilo means nothing for them. Null when no purchase in the period
 * has an earlier one to compare with.
 */
export function savingsBetween(
  batches: readonly Batch[],
  ingredientById: (id: string) => Ingredient | undefined,
  from: IsoDate,
  to: IsoDate,
): Savings | null {
  const priced = batches.filter((b) => b.rawWeightG > 0 && b.purchase.pricePaidMYR > 0);
  let savedMYR = 0;
  let compared = 0;
  let best: Savings['bestDeal'] = null;
  for (const b of priced.filter((p) => between(p.purchase.date, from, to))) {
    const before = priced.filter((p) => p.ingredientId === b.ingredientId && p.purchase.date < from);
    if (before.length === 0) continue;
    const usualPerG = before.reduce((s, p) => s + p.purchase.pricePaidMYR, 0)
      / before.reduce((s, p) => s + p.rawWeightG, 0);
    const usual = usualPerG * b.rawWeightG;
    const saved = usual - b.purchase.pricePaidMYR;
    savedMYR += saved;
    compared += 1;
    const fractionBelow = saved / usual;
    if (fractionBelow >= DEAL_MIN_FRACTION && (best === null || fractionBelow > best.fractionBelow)) {
      best = {
        name: ingredientById(b.ingredientId)?.name ?? UNKNOWN_INGREDIENT,
        location: b.purchase.location.trim(),
        fractionBelow,
      };
    }
  }
  return compared === 0 ? null : { savedMYR, compared, bestDeal: best };
}
