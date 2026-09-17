// FDA Daily Values (DV) from the US Nutrition Facts label, 21 CFR 101.9,
// as revised by the FDA's 2016 final rule (81 FR 33742, "Food Labeling:
// Revision of the Nutrition and Supplement Facts Labels"). VERIFIED against
// the primary regulatory text, extracted via pypdf from two FDA industry-FAQ
// PDFs that each quote the Federal Register table verbatim with a page
// citation back to the rule itself:
//   - Reference Daily Intakes (RDIs) for vitamins/minerals — calcium, iron,
//     magnesium, zinc, potassium — from
//     https://www.fda.gov/media/99069/download
//     ("Source: https://s3.amazonaws.com/public-inspection.federalregister.gov/2016-11867.pdf, pages 903-904")
//   - Daily Reference Values (DRVs) for macronutrients — fat, sodium,
//     total carbohydrate, dietary fiber, protein — from
//     https://www.fda.gov/media/99059/download
//     ("Source: ... 2016-11867.pdf, page 905")
// Retrieved and extracted 2026-09-17. A single flat figure per nutrient,
// based on a 2,000-calorie reference diet; not adjusted for age or sex
// (unlike RNI_MY). All values already in the units this app uses (mg for
// minerals, g for macros, kcal for energy) — no unit conversion was needed.
import type { NutrientKey } from '../core/types';

export const DV_US: Partial<Record<NutrientKey, number>> = {
  kcal: 2000,
  protein: 50,
  carbs: 275,
  fibre: 28,
  fat: 78,
  potassium: 4700,
  iron: 18,
  magnesium: 420,
  zinc: 11,
  calcium: 1300,
  sodium: 2300,
};
