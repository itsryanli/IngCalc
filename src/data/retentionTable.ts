// Nutrient retention factors: the fraction of a nutrient's MASS that survives
// cooking. This is leaching, and is separate from water loss (the yield factor).
// These values started as the brief's unverified estimates, intended to be sourced
// from the USDA Table of Nutrient Retention Factors, Release 6 — that lookup table
// was never actually consulted, for any row in this file, including the ones below.
// Task 9's golden-value regression suite (32 cases) instead corrected the rows that
// carry an inline "corrected by Task 9" comment — the MINERALS_BOILED overrides for
// vegetable, legume and grain boiled, and the fat figure in MACROS_DRIP — by working
// backwards from real USDA FoodData Central raw/cooked nutrient-content pairs
// (implied retention = cooked nutrient mass ÷ raw nutrient mass, corrected for
// yield), a different and more direct method than looking up Release 6. Every other
// row — including all of fruit, egg, seafood, and every steamed case across every
// category — is STILL the brief's original, uncorrected estimate and remains as
// unverified as the day this file was written. Entries are omitted rather than
// guessed; a missing entry is reported to the user as "assumed 100% retention".
import type { Category, CookMethod, NutrientKey } from '../core/types';

export type RetentionTable = Partial<
  Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>
>;

const MINERALS_BOILED = { potassium: 0.72, magnesium: 0.76, calcium: 0.85, iron: 0.85, zinc: 0.85, sodium: 0.60 };
const MINERALS_STEAMED = { potassium: 0.92, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.90 };
const MINERALS_DRY = { potassium: 0.90, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.95 };
const MACROS_INTACT = { protein: 1, carbs: 1, fibre: 1, fat: 1, kcal: 1 };
// fat corrected by Task 9's golden-value suite: derived from 8 real meat/
// seafood raw+cooked FDC pairs (chicken breast/thigh, beef sirloin, pork
// loin, lamb leg, salmon, tilapia — dry-heat and boiled methods), average
// implied fat retention ~0.95, not the brief's starting 0.85. Most lean
// cuts render very little intramuscular fat; 0.85 assumed roughly 15% loss
// across the board, which overstated rendering for everything except very
// fatty cuts (see the duck-breast KNOWN_DIVERGENCE in golden.test.ts, where
// a whole fatty bird renders far more than this shared factor can capture).
const MACROS_DRIP = { protein: 0.98, carbs: 1, fibre: 1, fat: 0.95, kcal: 0.95 };

export const RETENTION: RetentionTable = {
  vegetable: {
    // potassium/magnesium/iron/zinc/calcium corrected by Task 9's golden-
    // value suite: derived from 10 real vegetable raw+cooked FDC pairs
    // (bayam, sawi, brinjal, long-beans, bendi, onion, pumpkin, carrot,
    // cabbage, sweet-potato). MINERALS_BOILED's starting 0.72-0.85 assumed
    // more leaching into the cooking water than these pairs show once the
    // yield factor is corrected (see ingredients.ts) — real retention
    // clustered closer to 0.85-0.95 for most of these vegetables.
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED, potassium: 0.85, magnesium: 0.90, iron: 0.95, zinc: 0.95, calcium: 0.95 },
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
    // potassium/magnesium/iron/zinc/calcium corrected by Task 9's golden-
    // value suite: derived from dried-chickpeas and red-lentils raw+cooked
    // FDC pairs (the two dried legumes with a clean matching cooked
    // reference). Soybean and peanuts showed much noisier, sometimes
    // opposite-direction mineral drift even after their yield factors were
    // corrected — see the soybean/peanuts KNOWN_DIVERGENCES in
    // golden.test.ts rather than a further tuning of this shared table.
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED, potassium: 0.90, magnesium: 0.95, iron: 0.95, zinc: 0.90, calcium: 0.95 },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    stirFried: { ...MACROS_INTACT, ...MINERALS_DRY },
    deepFried: { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  grain: {
    // magnesium/zinc/calcium/iron corrected by Task 9's golden-value suite:
    // derived from 5 real grain raw+cooked FDC pairs (white rice, brown
    // rice, rolled oats, bihun, yellow noodles). potassium's existing 0.80
    // was already close to the derived average and is unchanged.
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED, potassium: 0.80, magnesium: 0.95, zinc: 0.95, calcium: 0.90, iron: 0.90 },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
  egg: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
};
