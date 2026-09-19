import type { CookMethod } from '../core/types';
import type { BatchState } from '../core/batch';
import type { ResolvedYield } from '../core/yieldResolver';

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
