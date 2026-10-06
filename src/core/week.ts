import { proteinPerMYRRaw } from './cost';
import { dayTotals, type MealContext } from './meals';
import { NOT_COOKED, type Batch, type DayLog, type Ingredient, type IsoDate, type MealEntry, type YieldSample } from './types';

/**
 * The week view: how the last seven days went, and a few gentle signs of
 * progress. Deliberately nothing that rewards eating less, punishes a missed
 * day, or resets: a day not logged is simply a day not logged.
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
