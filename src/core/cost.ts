import { sessionsOf } from './batch';
import { retentionFor, type RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient } from './types';
import { myr, type MYR } from './units';

/**
 * Every figure here returns null for "not computable yet" — no cooks logged, a
 * weightless batch, a price of zero — and the UI renders an em dash. One
 * convention, so no caller has to invent its own fallback.
 */

const PER_KG = 1000;

export function costPerKgRaw(batch: Batch): MYR | null {
  if (batch.rawWeightG <= 0) return null;
  return myr(batch.purchase.pricePaidMYR / (batch.rawWeightG / PER_KG));
}

/**
 * The share of a purchase price that belongs to what has actually been cooked.
 * A batch cooked in three sittings has to divide its price somehow, and raw
 * weight is the only basis that does not depend on how well each cook went.
 */
export function attributablePriceMYR(batch: Batch, sessions: readonly CookSession[]): MYR | null {
  if (batch.rawWeightG <= 0) return null;
  const rawUsed = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0);
  return myr(batch.purchase.pricePaidMYR * (rawUsed / batch.rawWeightG));
}

export function costPerKgCooked(batch: Batch, sessions: readonly CookSession[]): MYR | null {
  const price = attributablePriceMYR(batch, sessions);
  if (price === null) return null;
  const cooked = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.cookedWeightG, 0);
  if (cooked <= 0) return null;
  return myr(price / (cooked / PER_KG));
}

export function costPerPortion(batch: Batch, session: CookSession): MYR | null {
  if (batch.rawWeightG <= 0 || session.portionCount < 1) return null;
  const sessionPrice = batch.purchase.pricePaidMYR * (session.rawUsedG / batch.rawWeightG);
  return myr(sessionPrice / session.portionCount);
}

/**
 * The headline buying number: grams of protein per ringgit, known the moment
 * the purchase is entered, before anything is cooked.
 */
export function proteinPerMYRRaw(batch: Batch, ingredient: Ingredient): number | null {
  if (batch.purchase.pricePaidMYR <= 0) return null;
  const proteinG = (batch.rawWeightG / 100) * ingredient.per100gRaw.protein;
  return proteinG / batch.purchase.pricePaidMYR;
}

/**
 * The same figure after leaching, for the protein that actually reached the
 * plate.
 *
 * Note what this does NOT do: it never multiplies by a yield factor. Cooking
 * moves water, not protein — the measured `cookedWeightG` changes the
 * concentration, not the mass. Only retention removes protein, so only
 * retention is applied, and the user's own measured weights are respected
 * rather than re-derived.
 */
export function proteinPerMYRRetained(
  batch: Batch,
  ingredient: Ingredient,
  sessions: readonly CookSession[],
  retention: RetentionLookup,
): number | null {
  const price = attributablePriceMYR(batch, sessions);
  if (price === null || price <= 0) return null;

  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return null;

  const proteinG = mine.reduce((sum, s) => {
    const raw = (s.rawUsedG / 100) * ingredient.per100gRaw.protein;
    return sum + raw * retentionFor(retention, ingredient.category, s.method, 'protein').factor;
  }, 0);

  return proteinG / price;
}
