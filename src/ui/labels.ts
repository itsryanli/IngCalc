import type { CookMethod } from '../core/types';

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
