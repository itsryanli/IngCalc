import { NOT_COOKED, type Batch, type CookMethod, type CookSession, type Ingredient, type YieldSample } from './types';
import type { CategoryYield } from './yieldResolver';
import { formatG, type Grams } from './units';

/**
 * How far a cook may sit from the reference figure before it is worth
 * mentioning. Deliberately loose: a real kitchen differs from USDA's, and this
 * rule exists to catch a transposed digit, not to police technique.
 */
export const DEVIATION_TOLERANCE = 0.35;

/**
 * Outside a third of the reference to three times it, a reading is treated as
 * impossible rather than unusual. Three times catches every order-of-magnitude
 * slip while admitting every factor the bundled data itself publishes — up to
 * boiled rolled oats at 6.65.
 */
export const HARD_BOUND_MULTIPLE = 3;

/**
 * The parts of a cook that constitute a yield reading. A stored `CookSession`
 * satisfies this structurally, so it can be passed directly; the cook form
 * passes a draft, because a session does not exist yet at the point the user
 * most needs to be warned.
 */
export interface YieldObservation {
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
}

/**
 * What this ingredient and method are expected to yield. Published factor
 * first, category default second — the same precedence `resolveYield` uses for
 * its non-measured branches.
 */
export const referenceFactor = (
  ingredient: Ingredient,
  method: CookMethod,
  categoryYield: CategoryYield,
): number => (method === NOT_COOKED
  ? 1
  : ingredient.publishedYield[method] ?? categoryYield[ingredient.category][method]);

export interface YieldBounds {
  min: number;
  max: number;
}

export const yieldBounds = (reference: number): YieldBounds => ({
  min: reference / HARD_BOUND_MULTIPLE,
  max: reference * HARD_BOUND_MULTIPLE,
});

export const observedFactor = (obs: YieldObservation): number =>
  obs.rawUsedG <= 0 ? 0 : obs.cookedWeightG / obs.rawUsedG;

export interface OutlierFlag {
  kind: 'deviation' | 'implausible';
  observedFactor: number;
  /**
   * Always present, for both kinds. For an 'implausible' flag, the bounds
   * derived from this value are what decided it.
   */
  referenceFactor: number;
  /** Shown to the user verbatim. */
  reason: string;
}

const pct = (factor: number): string => `${Math.round(factor * 100)}%`;

/**
 * Advisory. Returns null for a cook worth nothing more than recording.
 *
 * Both bands are measured against the reference factor rather than against
 * `absorbsWater`, because that boolean cannot express what the data shows:
 * cabbage loses mass steamed and gains it boiled. The reference is already per
 * ingredient and per method.
 */
export function flagYield(
  obs: YieldObservation,
  ingredient: Ingredient,
  categoryYield: CategoryYield,
): OutlierFlag | null {
  if (obs.rawUsedG <= 0) return null;

  const reference = referenceFactor(ingredient, obs.method, categoryYield);
  if (reference <= 0) return null;

  const observed = observedFactor(obs);
  const bounds = yieldBounds(reference);

  if (observed < bounds.min || observed > bounds.max) {
    return {
      kind: 'implausible',
      observedFactor: observed,
      referenceFactor: reference,
      reason:
        `${formatG(obs.rawUsedG)} raw becoming ${formatG(obs.cookedWeightG)} cooked is ` +
        `${pct(observed)} of the raw weight, where ${pct(reference)} is typical. ` +
        'Check both weights.',
    };
  }

  if (Math.abs(observed - reference) / reference > DEVIATION_TOLERANCE) {
    return {
      kind: 'deviation',
      observedFactor: observed,
      referenceFactor: reference,
      reason: `This cook kept ${pct(observed)} of the raw weight, where ${pct(reference)} is typical.`,
    };
  }

  return null;
}

/**
 * The join that finally reaches `resolveYield`'s measured branch — dead code
 * since Phase 1, because nothing produced samples.
 *
 * A session knows only its batch, and the batch knows the ingredient. Joining
 * here rather than denormalising `ingredientId` onto the session keeps one
 * source of truth for which food a cook was; at this app's scale the cost is a
 * Map build over a few hundred rows.
 */
export function toYieldSamples(
  batches: readonly Batch[],
  sessions: readonly CookSession[],
): YieldSample[] {
  const ingredientOf = new Map(batches.map((b) => [b.id, b.ingredientId]));
  const samples: YieldSample[] = [];

  for (const s of sessions) {
    const ingredientId = ingredientOf.get(s.batchId);
    // An orphan would otherwise calibrate whichever food it was guessed onto.
    if (ingredientId === undefined) continue;
    samples.push({
      ingredientId,
      method: s.method,
      rawUsedG: s.rawUsedG,
      cookedWeightG: s.cookedWeightG,
      excludeFromCalibration: s.excludeFromCalibration,
    });
  }

  return samples;
}
