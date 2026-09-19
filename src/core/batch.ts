import { flagYield } from './calibration';
import type { Batch, CookMethod, CookSession, Ingredient, IsoDate, MealEntry, NutrientProfile } from './types';
import { NUTRIENT_KEYS } from './types';
import { formatG, g, type Grams } from './units';
import type { CategoryYield } from './yieldResolver';

/**
 * Half a hundredth of a gram. Weights arrive from division (portion weights)
 * and from user input in kilograms, so exact comparison would report a sliver
 * of raw meat left on a batch that was entirely cooked.
 */
export const EPSILON = 0.005;

export type BatchState = 'raw' | 'partiallyCooked' | 'cooked' | 'finished';

export const sessionsOf = (
  batchId: string,
  sessions: readonly CookSession[],
): CookSession[] => sessions.filter((s) => s.batchId === batchId);

export function rawRemainingG(batch: Batch, sessions: readonly CookSession[]): Grams {
  const used = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0);
  return g(Math.max(0, batch.rawWeightG - used));
}

/**
 * Never stored, per the parent spec. A stored status would have to be updated
 * at every transition, and the transitions are exactly where it would go wrong.
 */
export function batchState(
  batch: Batch,
  sessions: readonly CookSession[],
  entries: readonly MealEntry[],
): BatchState {
  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return 'raw';
  if (rawRemainingG(batch, sessions) > EPSILON) return 'partiallyCooked';
  return cookedRemainingTotalG(batch, sessions, entries) > EPSILON ? 'cooked' : 'finished';
}

/**
 * How much cooked food a batch still has, across all its cooks.
 *
 * Extracted because `BatchCard` computed the same reduce independently and the
 * two drifted: the card tested it with `> 0` while `batchState` tested the same
 * number with `> EPSILON`, so one card could read "Finished" and "cooked left"
 * at once. One sum, one tolerance, one place to change either.
 *
 * The `g()` wrap is load-bearing: a bare `.reduce()` is `number`, not `Grams`.
 */
export function cookedRemainingTotalG(
  batch: Batch,
  sessions: readonly CookSession[],
  entries: readonly MealEntry[],
): Grams {
  return g(sessionsOf(batch.id, sessions)
    .reduce((sum, s) => sum + cookedRemainingG(s, entries), 0));
}

export function portionWeightG(session: CookSession): Grams {
  if (session.portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${session.portionCount}`);
  }
  return g(session.cookedWeightG / session.portionCount);
}

/**
 * One portion's share of a cook's nutrients, for the calculator's split view.
 *
 * The same "grams are authoritative, portions are a view over them" rule as
 * `portionWeightG`, applied to the nutrient profile rather than the weight —
 * which is why it lives here rather than in a module of its own. Division is
 * exact; rounding belongs to the formatter at the point of display, so a
 * micronutrient that survives as 0.004mg per portion is still reported as a
 * nonzero amount rather than being rounded away mid-calculation.
 */
export function perPortion(totals: NutrientProfile, portionCount: number): NutrientProfile {
  // `< 1` alone would let NaN through (every NaN comparison is false) and
  // silently turn every nutrient into NaN. The calculator feeds this straight
  // from a text input, so that path is reachable.
  if (!Number.isFinite(portionCount) || portionCount < 1) {
    throw new RangeError(`portionCount must be a finite number of at least 1, got ${portionCount}`);
  }
  const out = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) out[key] = totals[key] / portionCount;
  return out;
}

/**
 * Derived from grams, not counted down. Eating a weighed 100g out of a 148g
 * portion has to mean something, and "0.68 portions gone" is the only answer
 * consistent with the grams actually leaving the container.
 */
export function portionsRemaining(
  session: CookSession,
  entries: readonly MealEntry[],
): number {
  if (session.cookedWeightG <= 0) return 0;
  return cookedRemainingG(session, entries) / portionWeightG(session);
}

export type Validation = { ok: true } | { ok: false; message: string };

const ok: Validation = { ok: true };
const no = (message: string): Validation => ({ ok: false, message });

export interface CookDraft {
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
  portionCount: number;
  cookedAt: IsoDate;
}

/**
 * Guards a cook before it is written. Every rejection names the real quantity,
 * because "invalid weight" tells the user nothing they can act on.
 *
 * The weight relationship is checked against the ingredient and method's
 * reference factor, not against a cooked-must-be-lighter-than-raw rule: boiled
 * greens and every grain legitimately gain mass. Only the impossible band is
 * blocked here; an unusual-but-possible cook is saved and left to `flagYield`
 * to mention, because the user's kitchen is allowed to differ from USDA's.
 */
export function validateCook(
  batch: Batch,
  sessions: readonly CookSession[],
  draft: CookDraft,
  ingredient: Ingredient,
  categoryYield: CategoryYield,
): Validation {
  if (draft.rawUsedG <= 0) return no(`Enter how much raw ${ingredient.name.toLowerCase()} you cooked.`);

  const remaining = rawRemainingG(batch, sessions);
  if (draft.rawUsedG > remaining + EPSILON) {
    return no(`Only ${formatG(remaining)} of this batch is still uncooked.`);
  }

  if (draft.cookedWeightG <= 0) return no('Weigh the cooked food and enter it.');

  if (!Number.isInteger(draft.portionCount) || draft.portionCount < 1) {
    return no('Split the cooked food into a whole number of portions, at least one.');
  }

  const flag = flagYield(draft, ingredient, categoryYield);
  if (flag?.kind === 'implausible') return no(flag.reason);

  return ok;
}

/** Portions are a view over grams, so the UI converts before validating. */
export const portionsToGrams = (session: CookSession, portions: number): Grams =>
  g(portionWeightG(session) * portions);

/**
 * `ingredient` and `quick` entries reference no cook session and so consume
 * nothing from one. Narrowing on the kinds rather than on the presence of the
 * field keeps the check tied to the union rather than to a property name.
 */
export const isSessionEntry = (e: MealEntry): e is MealEntry & { cookSessionId: string } =>
  e.kind === 'portion' || e.kind === 'weight';

/**
 * How much of a session one entry consumes.
 *
 * Zero for the kinds that consume nothing, so callers can reduce over a mixed
 * day without filtering first. Note the asymmetry it hides: a `weight` entry is
 * absolute, a `portion` entry is a share of a weight that can later be
 * corrected. `consumedFromSessionAt` is where that matters.
 */
export function entrySessionGrams(entry: MealEntry, session: CookSession): Grams {
  switch (entry.kind) {
    case 'portion': return portionsToGrams(session, entry.portions);
    case 'weight': return entry.grams;
    default: return g(0);
  }
}

/**
 * What a session would have lost if it had been weighed at `cookedWeightG` and
 * cut into `portionCount`.
 *
 * Portion entries are recomputed at the hypothetical values and weight entries
 * are not, because that is what the two kinds mean: "one container" follows the
 * pan, "180g on the scale" does not. Correcting a cook is the only caller that
 * needs the distinction, and it is the caller that would be wrong without it.
 */
export function consumedFromSessionAt(
  session: CookSession,
  entries: readonly MealEntry[],
  cookedWeightG: Grams,
  portionCount: number,
): Grams {
  const mine = entries.filter((e) => isSessionEntry(e) && e.cookSessionId === session.id);
  const weighed = mine.reduce((sum, e) => sum + (e.kind === 'weight' ? e.grams : 0), 0);
  const portions = mine.reduce((sum, e) => sum + (e.kind === 'portion' ? e.portions : 0), 0);
  if (portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${portionCount}`);
  }
  return g(weighed + (cookedWeightG / portionCount) * portions);
}

export const consumedFromSession = (
  session: CookSession,
  entries: readonly MealEntry[],
): Grams => consumedFromSessionAt(session, entries, session.cookedWeightG, session.portionCount);

/**
 * Derived, not stored. Phase 2 stored it because eating wrote no record;
 * meals are now that record, so the execution record's own rule applies —
 * derive what has an event log. Deleting an entry restores the remainder with
 * no compensating write, and there is no second number left to drift.
 */
export function cookedRemainingG(session: CookSession, entries: readonly MealEntry[]): Grams {
  return g(Math.max(0, session.cookedWeightG - consumedFromSession(session, entries)));
}

/**
 * A cook may be corrected in any way that still accounts for what has been
 * eaten out of it.
 *
 * Under a stored remainder this case was `rescaleCookedRemaining`'s job, which
 * preserved the fraction eaten. Under derivation the entries are fixed events
 * and it is the remainder that moves, so the same correction can drive it
 * negative — the guard moves to the edit rather than disappearing with the field.
 */
export function validateCookEdit(
  session: CookSession,
  entries: readonly MealEntry[],
  draft: CookDraft,
): Validation {
  const consumed = consumedFromSessionAt(session, entries, draft.cookedWeightG, draft.portionCount);
  if (consumed > draft.cookedWeightG + EPSILON) {
    return no(
      `${formatG(consumed)} of this cook has already been eaten, so it cannot ` +
      `come to less than that.`,
    );
  }
  return ok;
}

export const cookedRawTotalG = (batch: Batch, sessions: readonly CookSession[]): Grams =>
  g(sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0));

/**
 * A purchase weight may be corrected downwards only as far as what has already
 * been cooked out of it.
 */
export function validateRawWeightEdit(
  batch: Batch,
  sessions: readonly CookSession[],
  newRawWeightG: Grams,
): Validation {
  if (newRawWeightG <= 0) return no('A batch has to weigh something.');

  const cooked = cookedRawTotalG(batch, sessions);
  if (newRawWeightG < cooked - EPSILON) {
    return no(
      `${formatG(cooked)} of this batch has already been cooked, so it cannot ` +
      `have weighed less than that.`,
    );
  }

  return ok;
}

/** A session's raw weight may grow into whatever the *other* sessions left. */
export function validateRawUsedEdit(
  batch: Batch,
  sessions: readonly CookSession[],
  sessionId: string,
  newRawUsedG: Grams,
): Validation {
  if (newRawUsedG <= 0) return no('A cook has to use some of the batch.');

  const others = sessionsOf(batch.id, sessions)
    .filter((s) => s.id !== sessionId)
    .reduce((sum, s) => sum + s.rawUsedG, 0);
  const available = g(Math.max(0, batch.rawWeightG - others));

  if (newRawUsedG > available + EPSILON) {
    return no(`Only ${formatG(available)} of this batch is available for this cook.`);
  }

  return ok;
}
