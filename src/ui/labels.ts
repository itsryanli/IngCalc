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
 * What an entry says on the Log. Lives beside METHOD_LABELS rather than in the
 * component so the four kinds are described in one place and read consistently.
 */
export function describeEntry(entry: MealEntry, ctx: MealContext): string {
  if (entry.kind === 'quick') return `${entry.name} (quick)`;

  if (entry.kind === 'ingredient') {
    const name = ctx.ingredientById(entry.ingredientId)?.name ?? 'Unknown ingredient';
    return `${name}, ${METHOD_LABELS[entry.method].toLowerCase()} — ${formatG(entry.cookedG)}`;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined) return 'A cook that is no longer in your kitchen';

  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  const method = METHOD_LABELS[session.method].toLowerCase();
  const amount = entry.kind === 'portion'
    ? `${entry.portions} portion${entry.portions === 1 ? '' : 's'}`
    : formatG(entry.grams);

  return `${name}, ${method} — ${amount}`;
}

/**
 * What an available-to-eat cook says on the entry form's kitchen list. Lives
 * beside `describeEntry` rather than in the component, for the same reason:
 * one place where a session is turned into words the user reads.
 */
export function describeAvailable(
  session: CookSession,
  left: Grams,
  entries: readonly MealEntry[],
  ctx: MealContext,
): string {
  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  const portions = portionsRemaining(session, entries);
  return `${name}, ${METHOD_LABELS[session.method].toLowerCase()} — ${formatG(left)} left ` +
         `· ${portions.toFixed(1)} portions`;
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
