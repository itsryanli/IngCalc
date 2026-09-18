import { flagYield } from './calibration';
import type { Batch, CookMethod, CookSession, Ingredient, IsoDate } from './types';
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
export function batchState(batch: Batch, sessions: readonly CookSession[]): BatchState {
  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return 'raw';
  if (rawRemainingG(batch, sessions) > EPSILON) return 'partiallyCooked';
  const left = mine.reduce((sum, s) => sum + s.cookedRemainingG, 0);
  return left > EPSILON ? 'cooked' : 'finished';
}

export function portionWeightG(session: CookSession): Grams {
  if (session.portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${session.portionCount}`);
  }
  return g(session.cookedWeightG / session.portionCount);
}

/**
 * Derived from grams, not counted down. Eating a weighed 100g out of a 148g
 * portion has to mean something, and "0.68 portions gone" is the only answer
 * consistent with the grams actually leaving the container.
 */
export function portionsRemaining(session: CookSession): number {
  if (session.cookedWeightG <= 0) return 0;
  return session.cookedRemainingG / portionWeightG(session);
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

export function validateEat(session: CookSession, grams: Grams): Validation {
  if (grams <= 0) return no('Enter how much you ate.');

  if (grams > session.cookedRemainingG + EPSILON) {
    const portions = portionsRemaining(session);
    return no(`Only ${formatG(session.cookedRemainingG)} is left — about ${portions.toFixed(1)} portions.`);
  }

  return ok;
}

/** Returns a new session; callers persist it. Validate first. */
export function applyEat(session: CookSession, grams: Grams): CookSession {
  return { ...session, cookedRemainingG: g(Math.max(0, session.cookedRemainingG - grams)) };
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

/**
 * Rescales what is left after a cooked weight is corrected, preserving the
 * FRACTION eaten rather than the grams eaten — the grams were always a reading
 * of the same food, so weighing 800g as 80g and fixing it later should leave a
 * half-eaten batch still half remaining.
 */
export function rescaleCookedRemaining(session: CookSession, newCookedWeightG: Grams): Grams {
  // Nothing was eaten out of a session that never recorded a weight, so the
  // corrected weight is entirely remaining.
  if (session.cookedWeightG <= 0) return newCookedWeightG;

  const fractionLeft = session.cookedRemainingG / session.cookedWeightG;
  return g(Math.min(newCookedWeightG, Math.max(0, newCookedWeightG * fractionLeft)));
}
