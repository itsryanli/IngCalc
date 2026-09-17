// Recommended Nutrient Intakes for Malaysia (RNI Malaysia 2017), National
// Coordinating Committee on Food and Nutrition (NCCFN) / Ministry of Health
// Malaysia. VERIFIED against the primary source: the official MOH-published
// PDF, "Recommended Nutrient Intakes" (523 pp.), retrieved from
// https://hq.moh.gov.my/nutrition/wp-content/uploads/2023/12/FA-Buku-RNI.pdf
// on 2026-09-17 and extracted with `pdftotext -layout` (poppler-utils; the
// PDF's embedded font/CMap defeated other extractors, including WebFetch's
// own renderer and pypdf's default text extraction, which produced garbled
// text). Values below were cross-checked against THREE independent tables
// within that same document for every nutrient: the per-chapter narrative
// RNI statement, the chapter's own "Appendix N.1 comparison" table, and the
// book's consolidated "RNI for Malaysia 2017 Summary Tables" (pp. 520-523,
// Summary Tables 1, 3a and 3b) — all three agreed except where noted below.
//
// IRON BIOAVAILABILITY: the RNI states iron at multiple dietary
// bioavailability levels. WHO/FAO (2004), which the Malaysian RNI is based
// on, tabulates four levels (5%, 10%, 12%, 15%) for some age groups, but
// Malaysia's own adopted RNI (2017) publishes and recommends only TWO of
// those: 10% and 15% (Section 18.7: "10% and 15% iron bioavailability
// levels of WHO/FAO (2004) were adopted"; no 12% level appears anywhere in
// the Malaysian RNI's own tables). This file uses the 15% BIOAVAILABILITY
// figures throughout — the level the RNI 2017 says "approximates the usual
// level of iron intake among the Malaysian population" per the 2014 MANS
// survey. The 10% level (which covers people with lower-bioavailability
// diets) is also published and is HIGHER for every age/sex band; it is not
// included here, and the UI must label which level is being shown so this
// number is never presented as the only iron figure. (For reference, the
// unused 10% figures for men/women 19+: male 14 mg/day; female premenopause
// 29 mg/day; female postmenopause 11 mg/day.)
//
// KNOWN SOURCE ANOMALY (disclosed, not silently corrected): the Malaysian
// RNI 2017 states magnesium for women aged 51-59 and 60-69 as 420 mg/day —
// identical to the men's figure for the same bands, and HIGHER than the
// 320 mg/day given for women 30-50 and again for women >70. This value
// appears three times in the source, consistently (chapter 25 narrative
// text p.447, Appendix 25.1 comparison table p.453, and Summary Table 3b
// p.523), so it is not a copy error introduced by this extraction — it is
// what the Ministry of Health document itself publishes. It is, however,
// inconsistent with every comparator standard shown in the RNI's own
// Appendix 25.1 (FAO/WHO 2002, EFSA 2015, IOM 1997/2006 all give ~300-320
// mg/day for women in this age range) and breaks an otherwise monotonic
// pattern (310 -> 320 -> 420 -> 320). We transcribe it faithfully as
// published rather than substitute our own guess, but flag it here so a
// future maintainer does not assume it was independently re-verified as
// physiologically sensible — only that it matches the primary source.
//
// Nutrient keys not stocked by RNI Malaysia's per-nutrient chapters (kcal,
// carbs, fibre, fat) are intentionally absent: the app derives energy and
// macro targets from the user's own body stats (see the calorie/protein
// formulas elsewhere), not from a population reference table.
import type { NutrientKey, Sex } from '../core/types';

export interface RniBand {
  sex: Sex;
  minAge: number;
  maxAge: number;
  values: Partial<Record<NutrientKey, number>>;
}

export const RNI_MY: { bands: readonly RniBand[] } = {
  bands: [
    // --- Male ---
    // Summary Table 1 (protein), 3a (calcium/iron 15%/zinc), 3b (sodium/potassium/magnesium).
    { sex: 'male', minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 9, magnesium: 400, zinc: 6.6, calcium: 1000, sodium: 1500, protein: 62 } },
    { sex: 'male', minAge: 30, maxAge: 50, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.5, calcium: 1000, sodium: 1500, protein: 61 } },
    { sex: 'male', minAge: 51, maxAge: 59, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.5, calcium: 1000, sodium: 1500, protein: 61 } },
    // zinc within this band edges down further to 6.2 after age 65 per the
    // source's own finer "60-65" / ">65" split; 6.3 (the 60-65 figure) is
    // used for the whole 60-69 band as the closer approximation.
    { sex: 'male', minAge: 60, maxAge: 69, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.3, calcium: 1000, sodium: 1500, protein: 58 } },
    // Sodium drops to 1200 mg/day only after 70; protein/zinc/calcium/iron/
    // magnesium are unchanged from the 60-69 band at this final age split.
    { sex: 'male', minAge: 70, maxAge: 200, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.2, calcium: 1000, sodium: 1200, protein: 58 } },

    // --- Female ---
    // Iron switches from premenopausal (19-50) to postmenopausal (51+) at
    // age 51, per the RNI's own "premenopause"/"postmenopause" split.
    { sex: 'female', minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 20, magnesium: 310, zinc: 4.7, calcium: 1000, sodium: 1500, protein: 53 } },
    { sex: 'female', minAge: 30, maxAge: 50, values: { potassium: 4700, iron: 20, magnesium: 320, zinc: 4.6, calcium: 1000, sodium: 1500, protein: 52 } },
    // magnesium 420 here is the source anomaly described above, not a typo
    // introduced by this file — see the header comment.
    { sex: 'female', minAge: 51, maxAge: 59, values: { potassium: 4700, iron: 8, magnesium: 420, zinc: 4.6, calcium: 1200, sodium: 1500, protein: 52 } },
    { sex: 'female', minAge: 60, maxAge: 69, values: { potassium: 4700, iron: 8, magnesium: 420, zinc: 4.4, calcium: 1200, sodium: 1500, protein: 50 } },
    { sex: 'female', minAge: 70, maxAge: 200, values: { potassium: 4700, iron: 8, magnesium: 320, zinc: 4.3, calcium: 1200, sodium: 1200, protein: 50 } },
  ],
};

export function rniFor(sex: Sex, age: number): Partial<Record<NutrientKey, number>> {
  const band = RNI_MY.bands.find((b) => b.sex === sex && age >= b.minAge && age <= b.maxAge);
  return band?.values ?? {};
}
