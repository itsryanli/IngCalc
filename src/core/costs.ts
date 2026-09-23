import { sessionsOf } from './batch';
import {
  costPerKgCooked, costPerKgRaw, proteinPerMYRRaw, proteinPerMYRRetained,
} from './cost';
import type { RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient, IsoDate } from './types';
import { g, myr, type Grams, type MYR } from './units';

export type CostRange = 'thisMonth' | 'last3Months' | 'thisYear' | 'all';
export const COST_RANGES: readonly CostRange[] = ['thisMonth', 'last3Months', 'thisYear', 'all'];

export const UNKNOWN_INGREDIENT = 'Unknown ingredient';

/**
 * Months since year 0, so "two months before January" is subtraction. Worked
 * on the date's text rather than through `Date`, so there is no time zone and
 * no rollover to get wrong.
 */
const monthIndex = (iso: IsoDate): number =>
  Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

const monthIso = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** Calendar ranges: "this month" is September, not the last 30 days. */
export function inRange(date: IsoDate, range: CostRange, today: IsoDate): boolean {
  switch (range) {
    case 'all': return true;
    case 'thisYear': return date.slice(0, 4) === today.slice(0, 4);
    case 'thisMonth': return date.slice(0, 7) === today.slice(0, 7);
    case 'last3Months': {
      const back = monthIndex(today) - monthIndex(date);
      return back >= 0 && back <= 2;
    }
  }
}

/** The part of an export's filename that says which range it holds. */
export function rangeFileTag(range: CostRange, today: IsoDate): string {
  switch (range) {
    case 'all': return 'all';
    case 'thisYear': return today.slice(0, 4);
    case 'thisMonth': return today.slice(0, 7);
    case 'last3Months': return `${monthIso(monthIndex(today) - 2)}-to-${today.slice(0, 7)}`;
  }
}

/**
 * Every ingredient a stored row could name, archived ones included.
 *
 * Deliberately not `mergeCatalogue`, which drops archived ingredients because
 * it feeds a picker. A purchase made before its ingredient was archived is
 * still money spent, and must not turn into "Unknown ingredient" here.
 */
export function ingredientLookup(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): (id: string) => Ingredient | undefined {
  const byId = new Map<string, Ingredient>();
  for (const i of bundled) byId.set(i.id, i);
  for (const i of user) byId.set(i.id, i);
  return (id) => byId.get(id);
}

export interface PurchaseRow {
  batchId: string;
  date: IsoDate;
  /** The ingredient's name, or `UNKNOWN_INGREDIENT`. */
  ingredient: string;
  /** As stored; blank is possible. */
  location: string;
  rawWeightG: Grams;
  priceMYR: MYR;
  myrPerKgRaw: MYR | null;
  /** Protein in the whole purchase, raw. Feeds the weighted summary. */
  proteinRawG: number | null;
  proteinPerMYRRaw: number | null;
  /** Null when the batch was never cooked. */
  cookedG: Grams | null;
  myrPerKgCooked: MYR | null;
  proteinPerMYRCooked: number | null;
}

/**
 * One row per batch, newest-created first, which is also the tie order every
 * later sort preserves.
 *
 * Every money and protein figure comes from `cost.ts`, so the table can never
 * disagree with the batch card in Kitchen.
 */
export function purchaseRows(
  batches: readonly Batch[],
  sessions: readonly CookSession[],
  ingredientById: (id: string) => Ingredient | undefined,
  retention: RetentionLookup,
): PurchaseRow[] {
  return [...batches]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((b) => {
      const ing = ingredientById(b.ingredientId);
      const mine = sessionsOf(b.id, sessions);
      return {
        batchId: b.id,
        date: b.purchase.date,
        ingredient: ing?.name ?? UNKNOWN_INGREDIENT,
        location: b.purchase.location,
        rawWeightG: b.rawWeightG,
        priceMYR: b.purchase.pricePaidMYR,
        myrPerKgRaw: costPerKgRaw(b),
        proteinRawG: ing === undefined ? null : (b.rawWeightG / 100) * ing.per100gRaw.protein,
        proteinPerMYRRaw: ing === undefined ? null : proteinPerMYRRaw(b, ing),
        cookedG: mine.length === 0 ? null : g(mine.reduce((sum, s) => sum + s.cookedWeightG, 0)),
        myrPerKgCooked: costPerKgCooked(b, sessions),
        proteinPerMYRCooked: ing === undefined
          ? null
          : proteinPerMYRRetained(b, ing, sessions, retention),
      };
    });
}

export interface CostSummary {
  spentMYR: MYR;
  count: number;
  proteinPerMYR: number | null;
}

/**
 * Protein per RM across a range is total protein over total spend, NOT the
 * mean of each row's figure: a mean would weigh a RM2 bag of kangkung the same
 * as a RM40 chicken. The denominator is the spend on rows whose protein is
 * known, so a purchase of an unresolvable ingredient does not count as money
 * that bought no protein.
 */
export function summarise(rows: readonly PurchaseRow[]): CostSummary {
  let spent = 0;
  let knownSpent = 0;
  let protein = 0;
  for (const r of rows) {
    spent += r.priceMYR;
    if (r.proteinRawG !== null) {
      knownSpent += r.priceMYR;
      protein += r.proteinRawG;
    }
  }
  return {
    spentMYR: myr(spent),
    count: rows.length,
    proteinPerMYR: knownSpent > 0 ? protein / knownSpent : null,
  };
}
