import type { CookMethod, CookSession, MealEntry, MealLabel } from '../core/types';
import type { BatchState } from '../core/batch';
import { portionsRemaining } from '../core/batch';
import type { MealContext } from '../core/meals';
import type { ResolvedYield } from '../core/yieldResolver';
import { formatG } from '../core/units';
import type { Grams } from '../core/units';

/**
 * Human-readable cooking method names.
 *
 * `CookMethod` is camelCase because it is a code identifier, but rendering it
 * raw leaks "deepFried" and "stirFried" onto the screen. CSS `capitalize` only
 * makes that worse ("DeepFried"), so the mapping has to be explicit.
 */
export const METHOD_LABELS: Record<CookMethod, string> = {
  asIs: 'Not cooked (as is)',
  boiled: 'Boiled',
  steamed: 'Steamed',
  panFried: 'Pan-fried',
  stirFried: 'Stir-fried',
  deepFried: 'Deep-fried',
  roasted: 'Roasted',
  grilled: 'Grilled',
};

export const MEAL_LABELS: Record<MealLabel, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks',
};

/**
 * What an entry is, without how much of it: "Chicken breast, skinless, roasted".
 * Split out of `describeEntry` so the meals CSV, which has its own amount
 * columns, names items exactly as the Log does.
 */
export function entryItemName(entry: MealEntry, ctx: MealContext): string {
  if (entry.kind === 'quick') return entry.name;

  if (entry.kind === 'ingredient') {
    const name = ctx.ingredientById(entry.ingredientId)?.name ?? 'Unknown ingredient';
    return `${name}, ${METHOD_LABELS[entry.method].toLowerCase()}`;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined) return 'A cook that is no longer in your kitchen';

  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  return `${name}, ${METHOD_LABELS[session.method].toLowerCase()}`;
}

/**
 * An item as the Log and the entry form show it: the name on its own line, so
 * it stands out, and how it was cooked and how much on a quieter line below.
 */
export interface ItemLabel {
  name: string;
  detail: string;
}

/** Ingredient name without the method, which moves to the detail line. */
function sessionIngredientName(session: CookSession, ctx: MealContext): string {
  const batch = ctx.batches.find((b) => b.id === session.batchId);
  return (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
}

/**
 * What an entry says on the Log. Lives beside METHOD_LABELS rather than in the
 * component so the four kinds are described in one place and read consistently.
 */
export function entryLabel(entry: MealEntry, ctx: MealContext): ItemLabel {
  if (entry.kind === 'quick') return { name: entry.name, detail: 'Quick add' };

  if (entry.kind === 'ingredient') {
    return {
      name: ctx.ingredientById(entry.ingredientId)?.name ?? 'Unknown ingredient',
      detail: `${METHOD_LABELS[entry.method]} · ${formatG(entry.cookedG)}`,
    };
  }

  const amount = entry.kind === 'portion'
    ? `${entry.portions} portion${entry.portions === 1 ? '' : 's'}`
    : formatG(entry.grams);

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined) return { name: 'A cook that is no longer in your kitchen', detail: amount };

  return {
    name: sessionIngredientName(session, ctx),
    detail: `${METHOD_LABELS[session.method]} · ${amount}`,
  };
}

/**
 * What an available-to-eat cook says on the entry form's kitchen list. Lives
 * beside `entryLabel` rather than in the component, for the same reason:
 * one place where a session is turned into words the user reads.
 */
export function availableLabel(
  session: CookSession,
  left: Grams,
  entries: readonly MealEntry[],
  ctx: MealContext,
): ItemLabel {
  const portions = portionsRemaining(session, entries);
  return {
    name: sessionIngredientName(session, ctx),
    detail: `${METHOD_LABELS[session.method]} · ${formatG(left)} left · ${portions.toFixed(1)} portions`,
  };
}

export const STATE_LABELS: Record<BatchState, string> = {
  raw: 'Raw',
  partiallyCooked: 'Part cooked',
  cooked: 'Cooked',
  finished: 'Finished',
};

/**
 * Whose number the user is looking at, in the wording the parent spec §4 sets
 * out. The provenance matters more than the figure: the app must never show
 * precision it does not have.
 */
export function yieldSentence(resolved: ResolvedYield, published?: number): string {
  const factor = resolved.factor.toFixed(2);

  switch (resolved.source) {
    case 'notCooked':
      return 'Not cooked: weight and nutrients stay as they are';
    case 'measured': {
      const cooks = `${resolved.sampleCount} cook${resolved.sampleCount === 1 ? '' : 's'}`;
      const against = published === undefined ? '' : ` (published: ${published.toFixed(2)})`;
      return `Your average across ${cooks}: ${factor}${against}`;
    }
    case 'published':
      return `Published factor: ${factor}`;
    case 'categoryDefault':
      return `Category default: ${factor} — rough estimate`;
  }
}
