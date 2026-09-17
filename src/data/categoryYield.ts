// Category-average cooking yields, used ONLY as a last-resort fallback when an
// ingredient has no published factor for a method. These values are the brief's
// starting estimates and have not yet been independently cross-checked against
// their intended source. Task 9's golden-value regression suite will verify them.
// Source (intended): USDA Agriculture Handbook 102, Food Yields Summarized by
// Different Stages of Preparation. Values are category means and are labelled
// 'categoryDefault' in the UI so the user knows they are rough.
import type { Category, CookMethod } from '../core/types';

export const CATEGORY_YIELD: Record<Category, Record<CookMethod, number>> = {
  meat:      { boiled: 0.70, steamed: 0.75, panFried: 0.72, stirFried: 0.73, deepFried: 0.78, roasted: 0.73, grilled: 0.71 },
  seafood:   { boiled: 0.78, steamed: 0.82, panFried: 0.78, stirFried: 0.80, deepFried: 0.83, roasted: 0.79, grilled: 0.77 },
  egg:       { boiled: 1.00, steamed: 0.98, panFried: 0.88, stirFried: 0.88, deepFried: 0.90, roasted: 0.92, grilled: 0.90 },
  // boiled corrected by Task 9's golden-value suite: 10 independent real
  // vegetable raw+cooked FDC pairs (bayam, sawi, brinjal, long-beans, bendi,
  // pumpkin, carrot, cabbage, sweet-potato, onion) showed boiled-vegetable
  // yield varies by food — most gain mass (water uptake) rather than losing
  // the ~10% this fallback originally assumed. Onion loses a modest ~8%;
  // brinjal (eggplant) loses far more — ~30%, the single largest-magnitude
  // change among all 10 vegetables checked, not a "little" like onion's.
  // 1.05 (mass roughly conserved, slightly up) is a better catch-all
  // fallback than the original 0.90; this default is only used when an
  // ingredient has no ingredient-specific published yield (both onion and
  // brinjal do have one, so this fallback never actually applies to them).
  vegetable: { boiled: 1.05, steamed: 0.92, panFried: 0.80, stirFried: 0.78, deepFried: 0.72, roasted: 0.75, grilled: 0.74 },
  fruit:     { boiled: 0.90, steamed: 0.92, panFried: 0.82, stirFried: 0.82, deepFried: 0.75, roasted: 0.78, grilled: 0.77 },
  grain:     { boiled: 2.60, steamed: 2.40, panFried: 1.00, stirFried: 1.00, deepFried: 0.95, roasted: 0.95, grilled: 0.95 },
  legume:    { boiled: 2.20, steamed: 2.00, panFried: 0.92, stirFried: 0.92, deepFried: 0.88, roasted: 0.90, grilled: 0.90 },
  dairy:     { boiled: 0.95, steamed: 0.95, panFried: 0.90, stirFried: 0.90, deepFried: 0.90, roasted: 0.90, grilled: 0.90 },
  nut:       { boiled: 1.10, steamed: 1.10, panFried: 0.96, stirFried: 0.96, deepFried: 0.94, roasted: 0.95, grilled: 0.95 },
  other:     { boiled: 0.90, steamed: 0.92, panFried: 0.85, stirFried: 0.85, deepFried: 0.82, roasted: 0.85, grilled: 0.85 },
};
