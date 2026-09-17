// Nutrient retention factors: the fraction of a nutrient's MASS that survives
// cooking. This is leaching, and is separate from water loss (the yield factor).
// Source: USDA Table of Nutrient Retention Factors, Release 6.
// Entries are omitted rather than guessed; a missing entry is reported to the
// user as "assumed 100% retention".
import type { Category, CookMethod, NutrientKey } from '../core/types';

export type RetentionTable = Partial<
  Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>
>;

const MINERALS_BOILED = { potassium: 0.72, magnesium: 0.76, calcium: 0.85, iron: 0.85, zinc: 0.85, sodium: 0.60 };
const MINERALS_STEAMED = { potassium: 0.92, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.90 };
const MINERALS_DRY = { potassium: 0.90, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.95 };
const MACROS_INTACT = { protein: 1, carbs: 1, fibre: 1, fat: 1, kcal: 1 };
const MACROS_DRIP = { protein: 0.98, carbs: 1, fibre: 1, fat: 0.85, kcal: 0.95 };

export const RETENTION: RetentionTable = {
  vegetable: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    stirFried: { ...MACROS_INTACT, ...MINERALS_DRY, potassium: 0.90 },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    roasted:   { ...MACROS_INTACT, ...MINERALS_DRY },
    grilled:   { ...MACROS_INTACT, ...MINERALS_DRY },
    deepFried: { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  fruit: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_INTACT, ...MINERALS_DRY },
    grilled:   { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  meat: {
    boiled:    { ...MACROS_DRIP, ...MINERALS_BOILED },
    steamed:   { ...MACROS_DRIP, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_DRIP, ...MINERALS_DRY },
    grilled:   { ...MACROS_DRIP, ...MINERALS_DRY },
    panFried:  { ...MACROS_DRIP, ...MINERALS_DRY },
    stirFried: { ...MACROS_DRIP, ...MINERALS_DRY },
    deepFried: { ...MACROS_DRIP, ...MINERALS_DRY },
  },
  seafood: {
    boiled:    { ...MACROS_DRIP, ...MINERALS_BOILED },
    steamed:   { ...MACROS_DRIP, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_DRIP, ...MINERALS_DRY },
    grilled:   { ...MACROS_DRIP, ...MINERALS_DRY },
    panFried:  { ...MACROS_DRIP, ...MINERALS_DRY },
    stirFried: { ...MACROS_DRIP, ...MINERALS_DRY },
    deepFried: { ...MACROS_DRIP, ...MINERALS_DRY },
  },
  legume: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    stirFried: { ...MACROS_INTACT, ...MINERALS_DRY },
    deepFried: { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  grain: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED, potassium: 0.80 },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
  egg: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
};
