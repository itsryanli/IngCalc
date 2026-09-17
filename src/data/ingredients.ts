// src/data/ingredients.ts
// Nutrient values per 100g RAW. Source: USDA FoodData Central (Foundation or SR
// Legacy, raw form preferred); each entry's `sourceRef` is its FDC id so any
// figure can be rechecked. Values were pulled from the official FoodData
// Central "Foundation Foods" (2026-04-30) and "SR Legacy" (2018-04) full CSV
// dataset downloads (fdc.nal.usda.gov/download-datasets) and extracted
// programmatically (no manual transcription, no values from memory) after the
// live FoodData Central API (api.nal.usda.gov, DEMO_KEY) hit its rate limit
// for this session. Two entries have NO FoodData Central match at all and are
// explicitly flagged UNVERIFIED ESTIMATEs below and in the task report:
// `ikan-bilis` (dried anchovy has no dried-fish entry in Foundation/SR Legacy)
// and `dragonfruit` (no pitaya/dragon fruit entry in Foundation/SR Legacy).
// Where a nutrient is genuinely absent from an otherwise-used source entry
// (no measurement recorded at all, verified against the raw food_nutrient.csv
// rows), it is recorded as 0 per the task brief; those specific fields are
// called out in a trailing comment on the entry.
//
// Yield factors: representative typical cooking-yield figures in the style of
// USDA Agriculture Handbook 102, following this repo's `categoryYield.ts`
// convention. They were NOT individually re-verified against the primary
// Handbook 102 tables this session (no live access) and should be treated
// with the same "not yet independently cross-checked" caveat as
// `categoryYield.ts` / `retentionTable.ts`; Task 9's golden-value regression
// suite is expected to verify them. All are within the validation test's
// plausibility bands.
import type { Ingredient, NutrientProfile } from '../core/types';

const n = (p: Partial<NutrientProfile>): NutrientProfile => ({
  kcal: 0, protein: 0, carbs: 0, fibre: 0, fat: 0,
  potassium: 0, iron: 0, magnesium: 0, zinc: 0, calcium: 0, sodium: 0,
  ...p,
});

export const INGREDIENTS: readonly Ingredient[] = [
  // ---------------------------------------------------------------- MEAT ---
  {
    id: 'chicken-breast',
    name: 'Chicken breast, skinless',
    category: 'meat',
    per100gRaw: n({ kcal: 120, protein: 22.5, fat: 2.6, potassium: 334, iron: 0.37, magnesium: 27, zinc: 0.68, calcium: 5, sodium: 45 }),
    // roasted/grilled corrected by Task 9's golden-value suite: derived from
    // FDC 171077 (raw) vs FDC 171477/171534 (cooked, roasted/grilled) — the
    // brief's own starting figures were close but ~5% off.
    publishedYield: { roasted: 0.71, grilled: 0.72, panFried: 0.72, boiled: 0.70, steamed: 0.76 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171077',
    archived: false,
  },
  {
    id: 'chicken-thigh',
    name: 'Chicken thigh, boneless, skinless',
    category: 'meat',
    per100gRaw: n({ kcal: 149.3, protein: 18.6, fat: 7.9, potassium: 271.8, iron: 0.6, magnesium: 21.8, zinc: 1.35, calcium: 5.65, sodium: 62.3 }),
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 2646171 (raw) vs FDC 172388 (cooked, roasted).
    publishedYield: { roasted: 0.74, grilled: 0.74, panFried: 0.75, boiled: 0.72, steamed: 0.79 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2646171',
    archived: false,
  },
  {
    id: 'chicken-drumstick',
    name: 'Chicken drumstick, meat and skin',
    category: 'meat',
    per100gRaw: n({ kcal: 130.1, protein: 18.36, fat: 5.94, potassium: 244.1, iron: 0.67, magnesium: 18.55, zinc: 1.7, calcium: 8.29, sodium: 90.98 }),
    publishedYield: { roasted: 0.77, grilled: 0.73, panFried: 0.74, boiled: 0.71, steamed: 0.78 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2727566',
    archived: false,
  },
  {
    id: 'beef-sirloin',
    name: 'Beef, top sirloin steak',
    category: 'meat',
    per100gRaw: n({ kcal: 146.2, protein: 21.98, carbs: 0.22, fat: 5.71, potassium: 349.4, iron: 2.22, magnesium: 22.08, zinc: 3.45, calcium: 3.7, sodium: 42.85 }),
    // grilled corrected by Task 9's golden-value suite: derived from FDC
    // 2727574 (raw) vs FDC 168633 (cooked, broiled — treated as this app's
    // grilled).
    publishedYield: { roasted: 0.72, grilled: 0.73, panFried: 0.70, boiled: 0.68, stirFried: 0.72 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2727574',
    archived: false,
  },
  {
    id: 'beef-minced',
    name: 'Beef, ground, 80% lean / 20% fat',
    category: 'meat',
    per100gRaw: n({ kcal: 247.8, protein: 17.53, fat: 19.44, potassium: 273.3, iron: 1.97, magnesium: 16.41, zinc: 3.85, calcium: 6.89, sodium: 54.94 }),
    publishedYield: { panFried: 0.72, stirFried: 0.73, boiled: 0.70, deepFried: 0.75 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2514744',
    archived: false,
  },
  {
    id: 'pork-loin',
    name: 'Pork loin, boneless',
    category: 'meat',
    per100gRaw: n({ kcal: 173.7, protein: 21.12, fat: 9.47, potassium: 361.2, iron: 0.45, magnesium: 21.96, zinc: 1.57, calcium: 4.11, sodium: 40.2 }),
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 2646168 (raw) vs FDC 167821 (cooked, roasted).
    publishedYield: { roasted: 0.76, grilled: 0.70, panFried: 0.72, boiled: 0.71 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2646168',
    archived: false,
  },
  {
    id: 'pork-belly',
    name: 'Pork belly, with skin',
    category: 'meat',
    per100gRaw: n({ kcal: 385.4, protein: 15.2, fat: 35.83, potassium: 207.9, iron: 0.38, magnesium: 12.18, zinc: 1.07, calcium: 4.21, sodium: 49.7 }),
    publishedYield: { roasted: 0.65, panFried: 0.62, deepFried: 0.60, boiled: 0.68 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2727576',
    archived: false,
  },
  {
    id: 'lamb-leg',
    name: 'Lamb, leg, whole, separable lean and fat',
    category: 'meat',
    per100gRaw: n({ kcal: 209, protein: 18.47, fat: 14.42, potassium: 258, iron: 1.7, magnesium: 24, zinc: 3.43, calcium: 8, sodium: 57 }),
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 174372 (raw) vs FDC 174373 (cooked, roasted) — an exact lineage pair.
    publishedYield: { roasted: 0.69, grilled: 0.68, boiled: 0.70 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 174372',
    archived: false,
  },
  {
    id: 'duck-breast',
    name: 'Duck breast, meat and skin',
    // No cut-specific "duck breast" entry exists in Foundation/SR Legacy; this
    // uses the whole-duck "meat and skin" composition as the closest match.
    category: 'meat',
    per100gRaw: n({ kcal: 404, protein: 11.49, fat: 39.34, potassium: 209, iron: 2.4, magnesium: 15, zinc: 1.36, calcium: 11, sodium: 63 }),
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 172408 (raw, whole domesticated duck meat+skin) vs FDC 172409 (cooked,
    // roasted) — the same-lineage pair, not the breast-specific cooked entry
    // (which is a different bird/cut and was the wrong comparison). Fat and
    // kcal still diverge sharply after this fix — a very fatty whole bird
    // renders far more of its fat on roasting than the model's shared meat
    // fat-retention factor assumes; see KNOWN_DIVERGENCES in golden.test.ts.
    publishedYield: { panFried: 0.68, roasted: 0.60, grilled: 0.66 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 172408',
    archived: false,
  },

  // ------------------------------------------------------------ SEAFOOD ---
  {
    id: 'ikan-kembung',
    name: 'Ikan kembung (Indian mackerel)',
    // FDC has no Indian-mackerel-specific entry; uses Pacific/jack mackerel
    // (mixed species) as the closest available raw mackerel match.
    category: 'seafood',
    per100gRaw: n({ kcal: 158, protein: 20.07, fat: 7.89, potassium: 406, iron: 1.16, magnesium: 28, zinc: 0.67, calcium: 23, sodium: 86 }),
    publishedYield: { steamed: 0.84, panFried: 0.78, deepFried: 0.80, grilled: 0.76 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 173672',
    archived: false,
  },
  {
    id: 'ikan-tenggiri',
    name: 'Ikan tenggiri (Spanish mackerel)',
    category: 'seafood',
    per100gRaw: n({ kcal: 139, protein: 19.29, fat: 6.3, potassium: 446, iron: 0.44, magnesium: 33, zinc: 0.49, calcium: 11, sodium: 59 }),
    publishedYield: { steamed: 0.83, panFried: 0.79, deepFried: 0.81, grilled: 0.77 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 173673',
    archived: false,
  },
  {
    id: 'ikan-bilis',
    name: 'Ikan bilis (dried anchovy) [UNVERIFIED ESTIMATE]',
    // No FoodData Central match: Foundation/SR Legacy only carry FRESH raw
    // anchovy (FDC 174182), and dried ikan bilis has a very different profile
    // (concentrated protein/minerals, salted). These figures are literature-
    // typical placeholders, NOT individually verified this session. Recheck
    // before relying on them; see task-8-report.md sourcing table.
    category: 'seafood',
    per100gRaw: n({ kcal: 280, protein: 48, fat: 7, potassium: 742, iron: 3.7, magnesium: 150, zinc: 2.9, calcium: 1477, sodium: 1500 }),
    publishedYield: { deepFried: 0.85, panFried: 0.88 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'usda estimate (unverified; raw analog only: FDC 174182, fresh anchovy)',
    archived: false,
  },
  {
    id: 'prawn',
    name: 'Prawn (shrimp), farm raised',
    category: 'seafood',
    per100gRaw: n({ kcal: 75.7, protein: 15.57, carbs: 0.48, fat: 0.8, potassium: 145.9, iron: 0.52, magnesium: 22.53, zinc: 0.94, calcium: 64.63, sodium: 474.9 }),
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 2684443 (raw) vs FDC 171971 (cooked, moist heat, used as the boiled
    // proxy).
    publishedYield: { boiled: 0.70, steamed: 0.83, stirFried: 0.82, deepFried: 0.78 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2684443',
    archived: false,
  },
  {
    id: 'squid',
    name: 'Squid, mixed species',
    category: 'seafood',
    per100gRaw: n({ kcal: 92, protein: 15.58, carbs: 3.08, fat: 1.38, potassium: 246, iron: 0.68, magnesium: 33, zinc: 1.53, calcium: 32, sodium: 44 }),
    // deepFried mass-yield corrected by Task 9's golden-value suite: derived
    // from FDC 174223 (raw) vs FDC 171982 (cooked, fried). kcal/fat/carbs
    // still diverge after this fix — deep-frying adds oil mass via
    // absorption, which this app's retention model (a pure multiplier on the
    // RAW nutrient, never additive) cannot represent; see KNOWN_DIVERGENCES.
    publishedYield: { boiled: 0.75, stirFried: 0.78, deepFried: 0.85, grilled: 0.74 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 174223',
    archived: false,
  },
  {
    id: 'salmon',
    name: 'Salmon, Atlantic, farm raised',
    category: 'seafood',
    per100gRaw: n({ kcal: 203.1, protein: 20.32, fat: 13.11, potassium: 378.2, iron: 0.26, magnesium: 25.39, zinc: 0.34, calcium: 9.42, sodium: 49.49 }),
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 2684441 (raw) vs FDC 175168 (cooked, dry heat, used as the roasted
    // proxy).
    publishedYield: { steamed: 0.83, panFried: 0.78, grilled: 0.76, roasted: 0.90 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2684441',
    archived: false,
  },
  {
    id: 'tilapia',
    name: 'Tilapia, raw',
    category: 'seafood',
    per100gRaw: n({ kcal: 96, protein: 20.08, fat: 1.7, potassium: 302, iron: 0.56, magnesium: 27, zinc: 0.33, calcium: 10, sodium: 52 }),
    publishedYield: { steamed: 0.82, panFried: 0.77, deepFried: 0.80, grilled: 0.76 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 175176',
    archived: false,
  },
  {
    id: 'kerang',
    name: 'Kerang (cockles)',
    // potassium, magnesium, zinc and sodium were not measured at all in this
    // (older, Alaska Native food survey) source entry; recorded as 0 per the
    // task brief's rule for genuinely absent nutrients.
    category: 'seafood',
    per100gRaw: n({ kcal: 79, protein: 13.5, carbs: 4.7, fat: 0.7, iron: 16.2, calcium: 30 }),
    publishedYield: { boiled: 0.82, steamed: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169803',
    archived: false,
  },

  // --------------------------------------------------------- EGG & DAIRY ---
  {
    id: 'chicken-egg',
    name: 'Chicken egg, whole, raw',
    category: 'egg',
    per100gRaw: n({ kcal: 143, protein: 12.56, carbs: 0.72, fat: 9.51, potassium: 138, iron: 1.75, magnesium: 12, zinc: 1.29, calcium: 56, sodium: 142 }),
    publishedYield: { boiled: 1.00, panFried: 0.90, steamed: 0.97 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171287',
    archived: false,
  },
  {
    id: 'full-cream-milk',
    name: 'Full cream milk, 3.25% milkfat',
    category: 'dairy',
    per100gRaw: n({ kcal: 61, protein: 3.15, carbs: 4.8, fat: 3.25, potassium: 132, iron: 0.03, magnesium: 10, zinc: 0.37, calcium: 113, sodium: 43 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171265',
    archived: false,
  },
  {
    id: 'greek-yogurt',
    name: 'Greek yogurt, plain, whole milk',
    category: 'dairy',
    per100gRaw: n({ kcal: 94.51, protein: 8.78, carbs: 4.75, fat: 4.39, potassium: 146.9, magnesium: 10.7, zinc: 0.47, calcium: 110.9, sodium: 33.76 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2259794',
    archived: false,
  },
  {
    id: 'cheddar',
    name: 'Cheddar cheese',
    category: 'dairy',
    per100gRaw: n({ kcal: 408, protein: 23.3, carbs: 2.44, fat: 34, potassium: 77, iron: 0.16, magnesium: 26.8, zinc: 3.67, calcium: 707, sodium: 654 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 328637',
    archived: false,
  },

  // ------------------------------------------------------------ LEGUME ---
  {
    id: 'firm-tofu',
    name: 'Firm tofu, prepared with calcium sulfate',
    category: 'legume',
    // deepFried mass-yield corrected by Task 9's golden-value suite: derived
    // from FDC 172475 (raw) vs FDC 174304 (cooked, fried) — an exact lineage
    // pair. kcal/fat/carbs still diverge after this fix, for the same
    // oil-absorption reason as squid above; see KNOWN_DIVERGENCES.
    per100gRaw: n({ kcal: 144, protein: 17.27, carbs: 2.78, fibre: 2.3, fat: 8.72, potassium: 237, iron: 2.66, magnesium: 58, zinc: 1.57, calcium: 683, sodium: 14 }),
    publishedYield: { panFried: 0.85, deepFried: 0.92, stirFried: 0.90, boiled: 0.95 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 172475',
    archived: false,
  },
  {
    id: 'tempeh',
    name: 'Tempeh',
    // fibre was not measured in this source entry; recorded as 0 per brief.
    category: 'legume',
    per100gRaw: n({ kcal: 192, protein: 20.29, carbs: 7.64, fat: 10.8, potassium: 412, iron: 2.7, magnesium: 81, zinc: 1.14, calcium: 111, sodium: 9 }),
    publishedYield: { panFried: 0.82, deepFried: 0.72, stirFried: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 174272',
    archived: false,
  },
  {
    id: 'dried-chickpeas',
    name: 'Chickpeas, mature seeds, dried',
    category: 'legume',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 173756 (raw) vs FDC 173757 (cooked, boiled) — an exact lineage pair.
    per100gRaw: n({ kcal: 378, protein: 20.47, carbs: 62.95, fibre: 12.2, fat: 6.04, potassium: 718, iron: 4.31, magnesium: 79, zinc: 2.76, calcium: 57, sodium: 24 }),
    publishedYield: { boiled: 2.31, steamed: 2.3 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 173756',
    archived: false,
  },
  {
    id: 'red-lentils',
    name: 'Lentils, pink or red, dried',
    category: 'legume',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 174284 (raw, pink/red) vs FDC 172421 (cooked, boiled — generic
    // "Lentils, mature seeds" proxy; no pink/red-specific cooked entry
    // exists in FoodData Central).
    per100gRaw: n({ kcal: 358, protein: 23.91, carbs: 63.1, fibre: 10.8, fat: 2.17, potassium: 668, iron: 7.39, magnesium: 59, zinc: 3.6, calcium: 48, sodium: 7 }),
    publishedYield: { boiled: 2.65, steamed: 2.3 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 174284',
    archived: false,
  },
  {
    id: 'peanuts',
    name: 'Peanuts, raw',
    category: 'legume',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 2515376 (raw) vs FDC 174260 (cooked, boiled) — the brief's starting
    // 1.15 badly underestimated how much water raw peanuts absorb when
    // boiled in the shell/skin.
    per100gRaw: n({ kcal: 550.6, protein: 23.21, carbs: 26.5, fibre: 8.01, fat: 43.28, potassium: 635.6, iron: 1.55, magnesium: 179.7, zinc: 2.78, calcium: 49.13, sodium: 1.49 }),
    publishedYield: { boiled: 1.72, roasted: 0.95 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 2515376',
    archived: false,
  },
  {
    id: 'soybean',
    name: 'Soybeans, mature seeds, dried',
    category: 'legume',
    // boiled yield nudged (2.5 -> 2.6, kcal-anchored) by Task 9's golden-value
    // suite from FDC 174270 (raw) vs FDC 174299 (cooked, boiled). Unlike
    // every other legume/grain checked, soybean's protein-anchored (2.0),
    // carbs-anchored (3.6) and fibre-anchored (1.55) implied yields disagree
    // sharply with each other and with kcal (2.6) — a sign that soy protein
    // and soluble carbohydrate leach into the cooking water at different
    // rates, which no single mass-yield number can reconcile. Protein and
    // carbs remain excluded via KNOWN_DIVERGENCES in golden.test.ts.
    per100gRaw: n({ kcal: 446, protein: 36.49, carbs: 30.16, fibre: 9.3, fat: 19.94, potassium: 1797, iron: 15.7, magnesium: 280, zinc: 4.89, calcium: 277, sodium: 2 }),
    publishedYield: { boiled: 2.6, steamed: 2.3 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 174270',
    archived: false,
  },

  // ------------------------------------------------------------- GRAIN ---
  {
    id: 'white-rice',
    name: 'White rice, long grain',
    category: 'grain',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169756 (raw) vs FDC 169757 (cooked, boiled).
    per100gRaw: n({ kcal: 365, protein: 7.1, carbs: 80, fibre: 1.3, fat: 0.7, potassium: 115, iron: 0.8, magnesium: 25, zinc: 1.1, calcium: 28, sodium: 5 }),
    publishedYield: { boiled: 2.65, steamed: 2.4 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169756',
    archived: false,
  },
  {
    id: 'brown-rice',
    name: 'Brown rice, long grain',
    category: 'grain',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169703 (raw) vs FDC 169704 (cooked, boiled) — an exact lineage pair.
    per100gRaw: n({ kcal: 367, protein: 7.54, carbs: 76.25, fibre: 3.6, fat: 3.2, potassium: 250, iron: 1.29, magnesium: 116, zinc: 2.13, calcium: 9, sodium: 5 }),
    publishedYield: { boiled: 2.75, steamed: 2.3 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169703',
    archived: false,
  },
  {
    id: 'rolled-oats',
    name: 'Rolled oats, dry',
    category: 'grain',
    // boiled: derived from FDC 169705 (raw oats) vs FDC 173905 (cooked
    // oatmeal, "regular and quick", cooked with water): implies a ~6.65x
    // yield — a real, well-known property of cooked oatmeal (USDA's own
    // reference preparation is very water-heavy, ~70 kcal/100g cooked,
    // matching common "1 cup cooked oatmeal ≈ 166 kcal / 234 g" package
    // figures). This was previously capped at 3.4 to fit ingredients.test.ts's
    // then-3.5 ceiling; the controller raised that ceiling to 8.0 on this
    // exact evidence, so the real, uncapped value is restored here.
    per100gRaw: n({ kcal: 389, protein: 16.89, carbs: 66.27, fibre: 10.6, fat: 6.9, potassium: 429, iron: 4.72, magnesium: 177, zinc: 3.97, calcium: 54, sodium: 2 }),
    publishedYield: { boiled: 6.65, steamed: 2.2 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169705',
    archived: false,
  },
  {
    id: 'wheat-flour',
    name: 'Wheat flour, white, all-purpose',
    category: 'grain',
    per100gRaw: n({ kcal: 364, protein: 10.33, carbs: 76.31, fibre: 2.7, fat: 0.98, potassium: 107, iron: 4.64, magnesium: 22, zinc: 0.7, calcium: 15, sodium: 2 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 168894',
    archived: false,
  },
  {
    id: 'bihun',
    name: 'Bihun (rice vermicelli), dry',
    category: 'grain',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169742 (raw) vs FDC 168914 (cooked, boiled) — an exact lineage pair.
    per100gRaw: n({ kcal: 364, protein: 5.95, carbs: 80.18, fibre: 1.6, fat: 0.56, potassium: 30, iron: 0.7, magnesium: 12, zinc: 0.74, calcium: 18, sodium: 182 }),
    publishedYield: { boiled: 3.32, steamed: 2.5 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169742',
    archived: false,
  },
  {
    id: 'yellow-noodles',
    name: 'Yellow noodles (egg noodles), dry',
    category: 'grain',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169731 (raw) vs FDC 169732 (cooked, boiled) — an exact lineage pair.
    per100gRaw: n({ kcal: 384, protein: 14.16, carbs: 71.27, fibre: 3.3, fat: 4.44, potassium: 244, iron: 4.01, magnesium: 58, zinc: 1.92, calcium: 35, sodium: 21 }),
    publishedYield: { boiled: 3.12, steamed: 2.0 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169731',
    archived: false,
  },
  {
    id: 'white-bread',
    name: 'White bread, commercially prepared',
    category: 'grain',
    per100gRaw: n({ kcal: 270, protein: 9.43, carbs: 49.2, fibre: 2.3, fat: 3.59, potassium: 117, iron: 3.36, magnesium: 26.9, zinc: 0.88, calcium: 211, sodium: 477 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 325871',
    archived: false,
  },

  // ---------------------------------------------------------- VEGETABLE ---
  {
    id: 'kangkung',
    name: 'Kangkung (water spinach)',
    category: 'vegetable',
    per100gRaw: n({ kcal: 19, protein: 2.6, carbs: 3.1, fibre: 2.1, fat: 0.2, potassium: 312, iron: 1.67, magnesium: 71, zinc: 0.18, calcium: 77, sodium: 113 }),
    // boiled: no FoodData Central raw/cooked pair exists for kangkung to
    // derive a real number from, but Task 9's golden-value suite found the
    // SAME systematic pattern across every other boiled leafy/root
    // vegetable it could check directly (bayam, sawi, brinjal, etc. below):
    // boiled vegetables gain mass (water uptake) rather than lose it, so
    // this inherited 0.88 (mass loss) almost certainly has the wrong sign.
    // Rather than guess a replacement by analogy, the boiled factor is
    // removed entirely; resolveYield now falls through to
    // CATEGORY_YIELD.vegetable.boiled (corrected to 1.05 by this same
    // suite), and the UI labels the result 'categoryDefault' — an honest
    // rough estimate, not a confidently-wrong specific number.
    publishedYield: { steamed: 0.92, stirFried: 0.78 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 168390',
    archived: false,
  },
  {
    id: 'sawi',
    name: 'Sawi (mustard greens)',
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169256 (raw) vs FDC 169257 (cooked, boiled) — an exact lineage pair.
    // Boiled mustard greens gain mass, same direction as bayam above.
    per100gRaw: n({ kcal: 27, protein: 2.86, carbs: 4.67, fibre: 3.2, fat: 0.42, potassium: 384, iron: 1.64, magnesium: 32, zinc: 0.25, calcium: 115, sodium: 20 }),
    publishedYield: { boiled: 1.04, steamed: 0.91, stirFried: 0.79 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169256',
    archived: false,
  },
  {
    id: 'bayam',
    name: 'Bayam (amaranth leaves)',
    // fibre was not measured in this source entry; recorded as 0 per brief.
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 168385 (raw) vs FDC 169202 (cooked, boiled) — an exact lineage pair.
    // Boiled amaranth leaves GAIN mass (water uptake during boiling) rather
    // than lose it; the brief's starting estimate had the direction wrong,
    // not just the magnitude.
    per100gRaw: n({ kcal: 23, protein: 2.46, carbs: 4.02, fat: 0.33, potassium: 611, iron: 2.32, magnesium: 55, zinc: 0.9, calcium: 215, sodium: 20 }),
    publishedYield: { boiled: 1.04, steamed: 0.90, stirFried: 0.77 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 168385',
    archived: false,
  },
  {
    id: 'cabbage',
    name: 'Cabbage, raw',
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169975 (raw) vs FDC 168514 (cooked, boiled).
    per100gRaw: n({ kcal: 25, protein: 1.28, carbs: 5.8, fibre: 2.5, fat: 0.1, potassium: 170, iron: 0.47, magnesium: 12, zinc: 0.18, calcium: 40, sodium: 18 }),
    publishedYield: { boiled: 1.07, steamed: 0.94, stirFried: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169975',
    archived: false,
  },
  {
    id: 'long-beans',
    name: 'Long beans (yardlong bean), raw',
    // fibre was not measured in this source entry; recorded as 0 per brief.
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169222 (raw) vs FDC 169223 (cooked, boiled) — an exact lineage pair.
    per100gRaw: n({ kcal: 47, protein: 2.8, carbs: 8.35, fat: 0.4, potassium: 240, iron: 0.47, magnesium: 44, zinc: 0.37, calcium: 50, sodium: 4 }),
    publishedYield: { boiled: 0.96, steamed: 0.93, stirFried: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169222',
    archived: false,
  },
  {
    id: 'bendi',
    name: 'Bendi (okra), raw',
    category: 'vegetable',
    // boiled: derived from FDC 169260 (raw) vs FDC 169261 (cooked, boiled)
    // — an exact lineage pair — implies ~1.58x: okra's mucilage absorbs a
    // lot of boiling water, the same real phenomenon `absorbsWater` exists
    // to flag, even though the mechanism (fiber/mucilage, not starch) is
    // different from rice/pasta/legumes. Previously capped at 1.1 (this
    // repo's non-water-absorbing ceiling) with `absorbsWater: false`; the
    // controller ruled to restore the real value and flag this food as
    // water-absorbing instead of leaving a known-wrong number in place.
    per100gRaw: n({ kcal: 33, protein: 1.93, carbs: 7.45, fibre: 3.2, fat: 0.19, potassium: 299, iron: 0.62, magnesium: 57, zinc: 0.58, calcium: 82, sodium: 7 }),
    publishedYield: { boiled: 1.58, steamed: 0.93, stirFried: 0.83 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169260',
    archived: false,
  },
  {
    id: 'brinjal',
    name: 'Brinjal (eggplant), raw',
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 169228 (raw) vs FDC 169229 (cooked, boiled) — an exact lineage pair.
    // Brinjal loses ~30% of its mass when boiled (yield 0.69) — the
    // LARGEST-magnitude change of any of the 10 vegetables this suite
    // checked directly, several times onion's ~8% loss. Do not describe
    // this alongside onion as "both lose a modest amount" (an earlier draft
    // of this comment did, and understated it); most other vegetables in
    // this suite gain mass when boiled, and brinjal's loss is the biggest
    // single deviation from that pattern in either direction.
    per100gRaw: n({ kcal: 25, protein: 0.98, carbs: 5.88, fibre: 3.0, fat: 0.18, potassium: 229, iron: 0.23, magnesium: 14, zinc: 0.16, calcium: 9, sodium: 2 }),
    publishedYield: { boiled: 0.69, steamed: 0.90, stirFried: 0.75, deepFried: 0.72, roasted: 0.72 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169228',
    archived: false,
  },
  {
    id: 'carrot',
    name: 'Carrot, raw',
    category: 'vegetable',
    // boiled: derived from FDC 170393 (raw) vs FDC 170394 (cooked, boiled)
    // — an exact lineage pair — implies ~1.17x: boiled carrot genuinely
    // gains a little mass (water uptake), the same real phenomenon
    // `absorbsWater` exists to flag. Previously capped at 1.1 with
    // `absorbsWater: false`; the controller ruled to restore the real value
    // and flag this food as water-absorbing instead of leaving a
    // known-wrong number in place. (roasted is unaffected — dry heat, not
    // boiling, and stays well under 1.1 anyway.)
    per100gRaw: n({ kcal: 41, protein: 0.93, carbs: 9.58, fibre: 2.8, fat: 0.24, potassium: 320, iron: 0.3, magnesium: 12, zinc: 0.24, calcium: 33, sodium: 69 }),
    publishedYield: { boiled: 1.17, steamed: 0.93, stirFried: 0.85, roasted: 0.82 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 170393',
    archived: false,
  },
  {
    id: 'tomato',
    name: 'Tomato, red, ripe, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 18, protein: 0.88, carbs: 3.89, fibre: 1.2, fat: 0.2, potassium: 237, iron: 0.27, magnesium: 11, zinc: 0.17, calcium: 10, sodium: 5 }),
    publishedYield: { boiled: 0.85, stirFried: 0.80 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 170457',
    archived: false,
  },
  {
    id: 'cucumber',
    name: 'Cucumber, with peel, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 15, protein: 0.65, carbs: 3.63, fibre: 0.5, fat: 0.11, potassium: 147, iron: 0.28, magnesium: 13, zinc: 0.2, calcium: 16, sodium: 2 }),
    publishedYield: { stirFried: 0.85, boiled: 0.88 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 168409',
    archived: false,
  },
  {
    id: 'broccoli',
    name: 'Broccoli, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 32, protein: 2.57, carbs: 6.29, fibre: 2.4, fat: 0.34, potassium: 303, iron: 0.69, magnesium: 21, zinc: 0.42, calcium: 46, sodium: 36 }),
    publishedYield: { boiled: 0.91, steamed: 0.94, stirFried: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 321900',
    archived: false,
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 22.85, protein: 1.64, carbs: 4.72, fibre: 1.95, fat: 0.24, potassium: 274.4, iron: 0.33, magnesium: 14.2, zinc: 0.23, calcium: 20.35, sodium: 20 }),
    publishedYield: { boiled: 0.91, steamed: 0.94, stirFried: 0.85 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2685573',
    archived: false,
  },
  {
    id: 'taugeh',
    name: 'Taugeh (mung bean sprouts), raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 30, protein: 3.04, carbs: 5.94, fibre: 1.8, fat: 0.18, potassium: 149, iron: 0.91, magnesium: 21, zinc: 0.41, calcium: 13, sodium: 6 }),
    publishedYield: { boiled: 0.85, steamed: 0.90, stirFried: 0.80 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169957',
    archived: false,
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin, raw',
    category: 'vegetable',
    // boiled: derived from FDC 168448 (raw) vs FDC 168449 (cooked, boiled)
    // — an exact lineage pair — implies ~1.31x: boiled pumpkin gains mass
    // (water uptake), the same real phenomenon `absorbsWater` exists to
    // flag. Previously capped at 1.1 with `absorbsWater: false`; the
    // controller ruled to restore the real value and flag this food as
    // water-absorbing instead of leaving a known-wrong number in place.
    per100gRaw: n({ kcal: 26, protein: 1.0, carbs: 6.5, fibre: 0.5, fat: 0.1, potassium: 340, iron: 0.8, magnesium: 12, zinc: 0.32, calcium: 21, sodium: 1 }),
    publishedYield: { boiled: 1.31, steamed: 0.91, roasted: 0.80 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 168448',
    archived: false,
  },
  {
    id: 'sweet-potato',
    name: 'Sweet potato, raw',
    category: 'vegetable',
    // boiled: derived from FDC 168482 (raw) vs FDC 168484 (cooked, boiled,
    // without skin) implies ~1.13x: boiled sweet potato gains a little mass
    // (water uptake), the same real phenomenon `absorbsWater` exists to
    // flag. Previously capped at 1.1 with `absorbsWater: false`; the
    // controller ruled to restore the real value and flag this food as
    // water-absorbing instead of leaving a known-wrong number in place.
    per100gRaw: n({ kcal: 86, protein: 1.57, carbs: 20.12, fibre: 3.0, fat: 0.05, potassium: 337, iron: 0.61, magnesium: 25, zinc: 0.3, calcium: 30, sodium: 55 }),
    publishedYield: { boiled: 1.13, steamed: 0.92, roasted: 0.78 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 168482',
    archived: false,
  },
  {
    id: 'potato',
    name: 'Potato, flesh and skin, raw',
    category: 'vegetable',
    // roasted corrected by Task 9's golden-value suite: derived from FDC
    // 170026 (raw) vs FDC 170093 (cooked, baked in skin — used as the
    // roasted proxy).
    per100gRaw: n({ kcal: 77, protein: 2.05, carbs: 17.49, fibre: 2.1, fat: 0.09, potassium: 425, iron: 0.81, magnesium: 23, zinc: 0.3, calcium: 12, sodium: 6 }),
    publishedYield: { boiled: 0.90, steamed: 0.92, roasted: 0.82, deepFried: 0.68 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 170026',
    archived: false,
  },
  {
    id: 'onion',
    name: 'Onion, raw',
    category: 'vegetable',
    // boiled corrected by Task 9's golden-value suite: derived from FDC
    // 170000 (raw) vs FDC 170001 (cooked, boiled) — an exact lineage pair.
    // Onion loses a modest ~8% of its mass when boiled; most of the
    // leafy/root vegetables in this suite instead gain mass, and brinjal
    // (eggplant) loses far more than onion does — see the brinjal entry
    // below, this is not the same magnitude of effect. Real boiled-
    // vegetable yield varies by food, not in one uniform direction — see
    // the file-level note near bayam below.
    per100gRaw: n({ kcal: 40, protein: 1.1, carbs: 9.34, fibre: 1.7, fat: 0.1, potassium: 146, iron: 0.21, magnesium: 10, zinc: 0.17, calcium: 23, sodium: 4 }),
    publishedYield: { boiled: 0.92, stirFried: 0.75, deepFried: 0.55, roasted: 0.80 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 170000',
    archived: false,
  },
  {
    id: 'garlic',
    name: 'Garlic, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 149, protein: 6.36, carbs: 33.06, fibre: 2.1, fat: 0.5, potassium: 401, iron: 1.7, magnesium: 25, zinc: 1.16, calcium: 181, sodium: 17 }),
    publishedYield: { stirFried: 0.85, roasted: 0.75, deepFried: 0.50 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169230',
    archived: false,
  },
  {
    id: 'ginger',
    name: 'Ginger root, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 80, protein: 1.82, carbs: 17.77, fibre: 2.0, fat: 0.75, potassium: 415, iron: 0.6, magnesium: 43, zinc: 0.34, calcium: 16, sodium: 13 }),
    publishedYield: { stirFried: 0.90, boiled: 0.92 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169231',
    archived: false,
  },
  {
    id: 'chilli',
    name: 'Chilli, red, raw',
    category: 'vegetable',
    per100gRaw: n({ kcal: 40, protein: 1.87, carbs: 8.81, fibre: 1.5, fat: 0.44, potassium: 322, iron: 1.03, magnesium: 23, zinc: 0.26, calcium: 14, sodium: 9 }),
    publishedYield: { stirFried: 0.88, boiled: 0.90, deepFried: 0.75 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 170106',
    archived: false,
  },

  // -------------------------------------------------------------- FRUIT ---
  {
    id: 'banana',
    name: 'Banana, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 89, protein: 1.09, carbs: 22.84, fibre: 2.6, fat: 0.33, potassium: 358, iron: 0.26, magnesium: 27, zinc: 0.15, calcium: 5, sodium: 1 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 173944',
    archived: false,
  },
  {
    id: 'papaya',
    name: 'Papaya, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 43, protein: 0.47, carbs: 10.82, fibre: 1.7, fat: 0.26, potassium: 182, iron: 0.25, magnesium: 21, zinc: 0.08, calcium: 20, sodium: 8 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169926',
    archived: false,
  },
  {
    id: 'watermelon',
    name: 'Watermelon, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 30, protein: 0.61, carbs: 7.55, fibre: 0.4, fat: 0.15, potassium: 112, iron: 0.24, magnesium: 10, zinc: 0.1, calcium: 7, sodium: 1 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 167765',
    archived: false,
  },
  {
    id: 'mango',
    name: 'Mango, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 60, protein: 0.82, carbs: 14.98, fibre: 1.6, fat: 0.38, potassium: 168, iron: 0.16, magnesium: 10, zinc: 0.09, calcium: 11, sodium: 1 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169910',
    archived: false,
  },
  {
    id: 'orange',
    name: 'Orange, raw, all commercial varieties',
    category: 'fruit',
    per100gRaw: n({ kcal: 47, protein: 0.94, carbs: 11.75, fibre: 2.4, fat: 0.12, potassium: 181, iron: 0.1, magnesium: 10, zinc: 0.07, calcium: 40 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 169097',
    archived: false,
  },
  {
    id: 'apple',
    name: 'Apple, raw, with skin',
    category: 'fruit',
    per100gRaw: n({ kcal: 52, protein: 0.26, carbs: 13.81, fibre: 2.4, fat: 0.17, potassium: 107, iron: 0.12, magnesium: 5, zinc: 0.04, calcium: 6, sodium: 1 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171688',
    archived: false,
  },
  {
    id: 'guava',
    name: 'Guava, common, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 68, protein: 2.55, carbs: 14.32, fibre: 5.4, fat: 0.95, potassium: 417, iron: 0.26, magnesium: 22, zinc: 0.23, calcium: 18, sodium: 2 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 173044',
    archived: false,
  },
  {
    id: 'pineapple',
    name: 'Pineapple, raw',
    category: 'fruit',
    per100gRaw: n({ kcal: 54.05, protein: 0.46, carbs: 14.09, fibre: 0.93, fat: 0.21, potassium: 137.1, iron: 0.05, magnesium: 13.38, zinc: 0.11, calcium: 12.5 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2346398',
    archived: false,
  },
  {
    id: 'avocado',
    name: 'Avocado, raw, all commercial varieties',
    category: 'fruit',
    per100gRaw: n({ kcal: 160, protein: 2.0, carbs: 8.53, fibre: 6.7, fat: 14.66, potassium: 485, iron: 0.55, magnesium: 29, zinc: 0.64, calcium: 12, sodium: 7 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171705',
    archived: false,
  },
  {
    id: 'dragonfruit',
    name: 'Dragonfruit (pitaya) [UNVERIFIED ESTIMATE]',
    // No FoodData Central match: Foundation/SR Legacy have no pitaya/dragon
    // fruit entry at all. These figures are literature-typical placeholders,
    // NOT verified against FoodData Central this session. Recheck before
    // relying on them; see task-8-report.md sourcing table.
    category: 'fruit',
    per100gRaw: n({ kcal: 60, protein: 1.2, carbs: 13, fibre: 3, fat: 0.4, potassium: 120, iron: 0.4, magnesium: 18, zinc: 0.1, calcium: 8, sodium: 1 }),
    publishedYield: {},
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'usda estimate (unverified; no FDC pitaya/dragon fruit entry exists)',
    archived: false,
  },

  // --------------------------------------------------------------- NUT ---
  {
    id: 'almond',
    name: 'Almonds, whole, raw',
    category: 'nut',
    per100gRaw: n({ kcal: 583.6, protein: 21.45, carbs: 20.03, fibre: 10.78, fat: 51.09, potassium: 732.8, iron: 3.74, magnesium: 257.6, zinc: 2.87, calcium: 253.6 }),
    publishedYield: { roasted: 0.95 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2346393',
    archived: false,
  },
  {
    id: 'cashew',
    name: 'Cashew nuts, raw',
    category: 'nut',
    per100gRaw: n({ kcal: 533.48, protein: 17.44, carbs: 36.29, fibre: 4.1, fat: 38.86, potassium: 638.3, iron: 5.99, magnesium: 250.6, zinc: 5.07, calcium: 41.95, sodium: 4.76 }),
    publishedYield: { roasted: 0.95 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 2515374',
    archived: false,
  },
];

const BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));

export const findIngredient = (id: string): Ingredient | undefined => BY_ID.get(id);
