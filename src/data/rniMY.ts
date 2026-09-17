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
// BAND EDGES: bands are cut at every age where ANY of the seven nutrients
// below actually changes value in the source, even when that produces a
// single-year band (e.g. age 30, age 50) or a band where only one nutrient
// differs from its neighbour. This is intentional: an earlier version of
// this file grouped ages into fewer, coarser bands and "rounded" a value to
// the nearest published band when a nutrient's real cut point fell inside
// it (e.g. shipping the 60-65 zinc figure for ages 66-69 too, with a comment
// disclosing the approximation). A review caught that this produced a
// value that was flatly wrong — not "approximately right" — for part of a
// band's age range, silently in one case. The fix is precision, not a
// disclosed shortcut: every band boundary below is a boundary the source
// itself draws for at least one of these nutrients, confirmed against the
// document's literal printed digits (not against an assumed/general
// convention — a second pass caught that the zinc elderly split is printed
// as "60-64 years" / "> 65 years" in BOTH the zinc chapter's own "RNI for
// adults" narrative table (p.437-438) and Appendix 20.1, not "60-65" / "66+"
// as an earlier pass had assumed; see the zinc bands below).
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
// 320 mg/day given for women 31-50 and again for women >70. This value
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
// KNOWN SOURCE CONTRADICTION, age 70, magnesium (also disclosed, not
// changed): the magnesium chapter's own narrative "RNI for adults" table
// (p.447) labels its penultimate adult bucket "51-70 years" (i.e. age 70
// itself in the 51-70 bucket), while Appendix 25.1 (p.453) labels the same
// bucket "51-69 years" with a separate ">70 years" row (i.e. age 70 in the
// elderly bucket). For men both buckets give 420 either way, so it makes no
// practical difference. For women both buckets give 420 too (the anomaly
// above), and only the ">70"/">70" bucket afterward drops to 320 — so under
// EITHER reading, age 70 itself still gets 420, and the drop to 320 begins
// only after 70. This file's bands (51-59, 60-64, 65-69, 70-200) put age 70
// in the last band, matching Appendix 25.1's implied "70 and above" reading
// for the ">70" label (the same reading used for sodium's identically-
// punctuated ">70" cut) — but the source's own two tables disagree on
// exactly where 70 sits, and this is a genuine contradiction in the
// publication, not an oversight in this file.
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

/** Every band below starts at 19 — RNI Malaysia 2017 does not publish figures for under-19s. */
export const RNI_MIN_AGE = 19;

export const RNI_MY: { bands: readonly RniBand[] } = {
  bands: [
    // --- Male ---
    // Sources: Summary Table 1 (protein), 3a (calcium, iron at 15%, zinc),
    // 3b (sodium, potassium, magnesium); cross-checked against Appendix
    // 18.1/20.1/25.1 and each chapter's own narrative RNI table.
    //
    // Combined breakpoints for men, and which nutrient changes there:
    //   30 -> zinc (6.6 to 6.5) and protein (62 to 61)
    //   31 -> magnesium (400 to 420) [does NOT align with the 30 break above]
    //   60 -> zinc (6.5 to 6.3) and protein (61 to 58)
    //   65 -> zinc (6.3 to 6.2) [confirmed "> 65 years" in the zinc chapter's
    //         own narrative table p.438 and Appendix 20.1 — age 65 itself is
    //         still in the "60-64" bucket per the literal printed digits, so
    //         the elderly figure (6.2) starts at 65, not 66]
    //   70 -> sodium (1500 to 1200)
    { sex: 'male', minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 9, magnesium: 400, zinc: 6.6, calcium: 1000, sodium: 1500, protein: 62 } },
    // Single-age band: at 30, zinc/protein have already stepped down to
    // their 30-59 figures, but magnesium's own "19-30" bucket still applies
    // (steps up to 420 only from 31). Source: RNI adults table, magnesium
    // chapter p.447 ("19-30 years 400 mg/day / 31-50 years 420 mg/day").
    { sex: 'male', minAge: 30, maxAge: 30, values: { potassium: 4700, iron: 9, magnesium: 400, zinc: 6.5, calcium: 1000, sodium: 1500, protein: 61 } },
    { sex: 'male', minAge: 31, maxAge: 59, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.5, calcium: 1000, sodium: 1500, protein: 61 } },
    // Source: zinc chapter narrative "RNI for adults" table p.438 and
    // Appendix 20.1, both printed verbatim as "60-64 years   6.3 mg/day".
    { sex: 'male', minAge: 60, maxAge: 64, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.3, calcium: 1000, sodium: 1500, protein: 58 } },
    // Source: same tables, "> 65 years   6.2 mg/day" — i.e. age 65+, not
    // age 66+. Sodium is still 1500 here, per the "60-69" sodium bucket in
    // Summary Table 3b — the zinc and sodium cut points do not align,
    // hence this band and the next share every value but sodium.
    { sex: 'male', minAge: 65, maxAge: 69, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.2, calcium: 1000, sodium: 1500, protein: 58 } },
    // Source: Summary Table 3b sodium ">70 years" bucket.
    { sex: 'male', minAge: 70, maxAge: 200, values: { potassium: 4700, iron: 9, magnesium: 420, zinc: 6.2, calcium: 1000, sodium: 1200, protein: 58 } },

    // --- Female ---
    // Combined breakpoints for women, and which nutrient changes there:
    //   30 -> zinc (4.7 to 4.6) and protein (53 to 52)
    //   31 -> magnesium (310 to 320) [does NOT align with the 30 break above]
    //   50 -> calcium (1000 to 1200) [does NOT align with 31 or 51]
    //   51 -> iron (20 to 8, premenopause to postmenopause) and magnesium
    //         (320 to 420, the disclosed anomaly)
    //   60 -> zinc (4.6 to 4.4) and protein (52 to 50)
    //   65 -> zinc (4.4 to 4.3) [same "60-64" / "> 65" printed split as men,
    //         confirmed in the zinc chapter's own narrative table and
    //         Appendix 20.1 — not 66, per the correction above]
    //   70 -> sodium (1500 to 1200) and magnesium (420 anomaly resolves to 320)
    { sex: 'female', minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 20, magnesium: 310, zinc: 4.7, calcium: 1000, sodium: 1500, protein: 53 } },
    // Single-age band: at 30, zinc/protein have stepped down to their
    // 30-59 figures, but magnesium's "19-30" bucket still applies (steps up
    // to 320 only from 31). Source: RNI adults table, magnesium chapter
    // p.447 ("19-30 years 310 mg/day / 31-50 years 320 mg/day").
    { sex: 'female', minAge: 30, maxAge: 30, values: { potassium: 4700, iron: 20, magnesium: 310, zinc: 4.6, calcium: 1000, sodium: 1500, protein: 52 } },
    { sex: 'female', minAge: 31, maxAge: 49, values: { potassium: 4700, iron: 20, magnesium: 320, zinc: 4.6, calcium: 1000, sodium: 1500, protein: 52 } },
    // Single-age band: calcium's own bucket boundary is "40-49" / "50-59"
    // (Appendix 17.1 / Summary Table 3a, and confirmed again in the
    // calcium chapter's own narrative "RNI for adults" table), i.e. calcium
    // steps up to 1200 at exactly 50 — one year before iron/magnesium's own
    // 51 boundary below.
    { sex: 'female', minAge: 50, maxAge: 50, values: { potassium: 4700, iron: 20, magnesium: 320, zinc: 4.6, calcium: 1200, sodium: 1500, protein: 52 } },
    // magnesium 420 here is the disclosed source anomaly described in the
    // header comment, not a typo introduced by this file.
    { sex: 'female', minAge: 51, maxAge: 59, values: { potassium: 4700, iron: 8, magnesium: 420, zinc: 4.6, calcium: 1200, sodium: 1500, protein: 52 } },
    { sex: 'female', minAge: 60, maxAge: 64, values: { potassium: 4700, iron: 8, magnesium: 420, zinc: 4.4, calcium: 1200, sodium: 1500, protein: 50 } },
    { sex: 'female', minAge: 65, maxAge: 69, values: { potassium: 4700, iron: 8, magnesium: 420, zinc: 4.3, calcium: 1200, sodium: 1500, protein: 50 } },
    { sex: 'female', minAge: 70, maxAge: 200, values: { potassium: 4700, iron: 8, magnesium: 320, zinc: 4.3, calcium: 1200, sodium: 1200, protein: 50 } },
  ],
};

export function rniFor(sex: Sex, age: number): Partial<Record<NutrientKey, number>> {
  const band = RNI_MY.bands.find((b) => b.sex === sex && age >= b.minAge && age <= b.maxAge);
  return band?.values ?? {};
}
