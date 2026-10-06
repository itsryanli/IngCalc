import {
  consumedFromSessionAt, entrySessionGrams, EPSILON, portionsToGrams, portionWeightG,
  type Validation,
} from './batch';
import { addNutrients, mapNutrients, scaleNutrients, zeroNutrients } from './nutrients';
import { computeCooked, computeRaw, rawFromCooked } from './nutrition';
import { retentionFor, type RetentionLookup } from './retention';
import {
  NUTRIENT_KEYS,
  type Batch, type CookSession, type Ingredient, type MealEntry, type MealEntryFields,
  type NutrientKey, type NutrientProfile, type YieldSample,
} from './types';
import { formatG, g } from './units';
import type { CategoryYield } from './yieldResolver';

/**
 * Everything needed to resolve an entry to nutrients, passed in rather than
 * imported: `core/` may not reach into `data/` (`purity.test.ts` enforces it),
 * which is the same reason `computeCooked` takes its tables as arguments.
 */
export interface MealContext {
  sessions: readonly CookSession[];
  /** A session reaches its ingredient through its batch. */
  batches: readonly Batch[];
  ingredientById: (id: string) => Ingredient | undefined;
  /** `ingredient` entries inherit calibration from the user's own cooks. */
  samples: readonly YieldSample[];
  categoryYield: CategoryYield;
  retention: RetentionLookup;
}

const ok: Validation = { ok: true };
const no = (message: string): Validation => ({ ok: false, message });

/**
 * The nutrients in a whole cook, after leaching and before anything is eaten.
 *
 * Deliberately NOT `computeCooked`. That would re-derive the cooked weight from
 * a yield factor when the user has already weighed the pan. Cooking moves water,
 * not nutrients: the measured `cookedWeightG` sets the concentration, so it
 * belongs in the denominator of `entryNutrients` and never as a factor here.
 * Only retention removes anything. See execution record §3.8 and the identical
 * rule in `proteinPerMYRRetained`.
 *
 * Do not "fix" this by routing it through `computeCooked`.
 */
export function sessionRetainedNutrients(
  session: CookSession,
  ingredient: Ingredient,
  retention: RetentionLookup,
): NutrientProfile {
  const raw = computeRaw(ingredient, session.rawUsedG).totals;
  return mapNutrients(raw, (value, key) =>
    value * retentionFor(retention, ingredient.category, session.method, key).factor);
}

const ingredientForSession = (
  session: CookSession,
  ctx: MealContext,
): Ingredient | undefined => {
  const batch = ctx.batches.find((b) => b.id === session.batchId);
  return batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId);
};

/**
 * An entry whose session, batch or ingredient cannot be resolved contributes
 * zero rather than taking the day's totals down with it. Deletion cascades, so
 * that should be unreachable — but it is the landing screen's arithmetic, and
 * a thrown error there costs the user the whole day.
 *
 * Not literally total, though: a malformed stored row can still throw, via
 * `portionsToGrams` → `portionWeightG` (`RangeError` on a `portionCount` below
 * one) or via `g()` on a negative product. Neither is writable through the UI,
 * and a corrupt row is what the ErrorBoundary is for; the unresolvable-
 * reference path above is the one this function absorbs.
 */
export function entryNutrients(entry: MealEntry, ctx: MealContext): NutrientProfile {
  if (entry.kind === 'quick') {
    return { ...zeroNutrients(), kcal: entry.kcal, protein: entry.proteinG ?? 0 };
  }

  if (entry.kind === 'ingredient') {
    const ingredient = ctx.ingredientById(entry.ingredientId);
    if (ingredient === undefined || entry.cookedG <= 0) return zeroNutrients();
    const { rawWeightG } = rawFromCooked(
      ingredient, entry.cookedG, entry.method, ctx.samples, ctx.categoryYield,
    );
    return computeCooked({
      ingredient, rawG: rawWeightG, method: entry.method,
      samples: ctx.samples, categoryYield: ctx.categoryYield, retention: ctx.retention,
    }).totals;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined || session.cookedWeightG <= 0) return zeroNutrients();
  const ingredient = ingredientForSession(session, ctx);
  if (ingredient === undefined) return zeroNutrients();

  const retained = sessionRetainedNutrients(session, ingredient, ctx.retention);
  return scaleNutrients(retained, entrySessionGrams(entry, session) / session.cookedWeightG);
}

export interface DayTotals {
  totals: NutrientProfile;
  /**
   * Entries missing at least one micronutrient figure: every `quick` entry, and
   * any entry whose ingredient has unknown minerals (a label that left them out).
   */
  unknownMicroEntries: number;
  /** Entries with no protein figure: a quick entry left blank, or an ingredient without one. */
  unknownProteinEntries: number;
  /** Per nutrient, how many entries had no figure for it: where a total is only "at least". */
  unknownFor: Partial<Record<NutrientKey, number>>;
}

const MICROS: readonly NutrientKey[] = ['potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium'];

/** The nutrients this entry has no figure for. */
export function unknownNutrientsOf(entry: MealEntry, ctx: MealContext): readonly NutrientKey[] {
  if (entry.kind === 'quick') {
    return NUTRIENT_KEYS.filter((k) => k !== 'kcal' && !(k === 'protein' && entry.proteinG !== undefined));
  }
  if (entry.kind === 'ingredient') return ctx.ingredientById(entry.ingredientId)?.unknownNutrients ?? [];
  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  return (session === undefined ? undefined : ingredientForSession(session, ctx))?.unknownNutrients ?? [];
}

/**
 * The two counts are separate rather than one "incomplete" flag because
 * calories, protein and micronutrients degrade independently: a `quick` entry
 * always carries calories, usually carries protein, and never carries
 * micronutrients. Collapsing them would put an "at least" on a figure that is
 * exact.
 */
export function dayTotals(entries: readonly MealEntry[], ctx: MealContext): DayTotals {
  let totals = zeroNutrients();
  let unknownMicroEntries = 0;
  let unknownProteinEntries = 0;
  const unknownFor: Partial<Record<NutrientKey, number>> = {};

  for (const entry of entries) {
    totals = addNutrients(totals, entryNutrients(entry, ctx));
    const unknown = unknownNutrientsOf(entry, ctx);
    if (unknown.some((k) => MICROS.includes(k))) unknownMicroEntries += 1;
    if (unknown.includes('protein')) unknownProteinEntries += 1;
    for (const k of unknown) unknownFor[k] = (unknownFor[k] ?? 0) + 1;
  }

  return { totals, unknownMicroEntries, unknownProteinEntries, unknownFor };
}

/**
 * `editingId` is required, not optional, because forgetting it produces a bug
 * that reads as correct code: growing an entry from 150g to 160g would compare
 * 160 against a remainder that already has its own 150 subtracted, and refuse a
 * valid edit. `null` means the draft is new.
 */
export function validateEntry(
  draft: MealEntryFields,
  ctx: MealContext,
  entries: readonly MealEntry[],
  editingId: string | null,
): Validation {
  if (draft.kind === 'quick') {
    if (draft.name.trim() === '') return no('Give this a name so you can recognise it later.');
    if (!Number.isFinite(draft.kcal) || draft.kcal <= 0) return no('Enter roughly how many calories it was.');
    if (draft.proteinG !== undefined && (!Number.isFinite(draft.proteinG) || draft.proteinG < 0)) {
      return no('Protein cannot be negative. Leave it blank if you do not know.');
    }
    return ok;
  }

  if (draft.kind === 'ingredient') {
    if (ctx.ingredientById(draft.ingredientId) === undefined) return no('Choose an ingredient.');
    if (draft.cookedG <= 0) return no('Enter how much you ate.');
    return ok;
  }

  const session = ctx.sessions.find((s) => s.id === draft.cookSessionId);
  if (session === undefined) return no('That cook is no longer in your kitchen.');

  if (draft.kind === 'portion' && (!Number.isFinite(draft.portions) || draft.portions <= 0)) {
    return no('Enter how many portions you ate.');
  }
  if (draft.kind === 'weight' && draft.grams <= 0) return no('Enter how much you ate.');

  // Everything except the entry being edited, so growing an entry is measured
  // against the room its own current value occupies.
  const others = entries.filter((e) => e.id !== editingId);
  const consumed = consumedFromSessionAt(
    session, others, session.cookedWeightG, session.portionCount,
  );
  const remaining = g(Math.max(0, session.cookedWeightG - consumed));

  // `portionsToGrams`/`portionWeightG`, never the division inline: spec §3.2
  // keeps the portions-are-a-view-over-grams rule in `core/batch.ts` alone.
  // The inline form also differed in behaviour, yielding Infinity where
  // `portionWeightG` throws on a portionCount below 1.
  const wanted = draft.kind === 'weight'
    ? draft.grams
    : portionsToGrams(session, draft.portions);

  if (wanted > remaining + EPSILON) {
    const portionsLeft = remaining / portionWeightG(session);
    return no(`Only ${formatG(remaining)} is left — about ${portionsLeft.toFixed(1)} portions.`);
  }

  return ok;
}
