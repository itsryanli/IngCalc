# IngCalc Phase 1 — Execution Record

Generated during subagent-driven execution of `docs/superpowers/plans/2026-09-17-ingcalc-phase-1.md`.

**Why this file exists:** the plan is stale in several documented places — evidence gathered during execution overrode it. This is the record of every ruling made and why, including which plan figures were found wrong. Read it before trusting the plan document for Phase 2.


Spec: docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md (read)
Branch: phase-1-calculator (created from main @ 3414cb1)
Baseline: greenfield — no package.json, no test suite yet. Task 1 creates them.
Isolation: feature branch in place, user chose this over a worktree (nothing to protect; app must build where they can run it).

## Pre-flight conflict scan

### Cross-task rows (shared file or interface)

| Producer | Consumer | Interface | Finding |
|---|---|---|---|
| T1 | T20 | `src/ui/App.tsx`, `vite.config.ts`, `src/main.tsx` | OK — T20 declares "replacing the scaffold" |
| T2 | T3,6,7,15,19 | `Grams`, `g`, `kgToG`, `gToKg` | OK |
| T3 | T4,5,6,7,8,10–19 | domain types, `NUTRIENT_KEYS`, `CATEGORIES`, `COOK_METHODS` | OK |
| T3 | T6 | `YieldSample` (decoupled from CookSession) | OK — deliberate, Phase 2 maps onto it |
| T4 | T6,7,9,12,19 | `CATEGORY_YIELD` (total table) | OK — totality enforced by T4 test |
| T5 | T7,9,12,19 | `RETENTION`, `retentionFor` | OK — `RetentionTable`/`RetentionLookup` shapes duplicated across data/core by design, to hold core purity |
| T6 | T7,12 | `resolveYield`, `ResolvedYield`, `CategoryYield` | OK |
| T7 | T9,16,19 | `computeCooked`, `CalcStep`, `CookedResult`, `rawFromCooked` | OK — arithmetic in T7 tests verified consistent with T5 factors (225×0.98=220.5; 220.5/750×100=29.4; 3340×0.90=3006) |
| T8 | T9,14,19 | `INGREDIENTS`, `findIngredient`, ingredient ids | **F4** — T8/T19 tests hardcode ids (`chicken-breast`, `white-rice`, `dried-chickpeas`, `red-lentils`, `brown-rice`, `rolled-oats`); plan never states ids are binding |
| T10 | T11,19 | `rniFor`, `DV_US` | OK |
| T11 | T17,19 | `bmr`, `tdee`, `calorieTarget`, `proteinTargetG`, `proteinGPerKgFor`, `proteinGPerLb`, `microTargets` | OK — `proteinGPerKgFor` added to interface block during plan self-review |
| T12 | T19 | `compareMethods`, `MethodRow` | OK — ranking arithmetic checked (steamed 92 > boiled 74) |
| T13 | T14,17,18,20 | `db`, `isStorageAvailable`, profile/settings/ingredient CRUD | OK |
| T14 | T19 | `useCatalogue`, `mergeCatalogue` | **F2** — no refresh; catalogue loads once on mount |
| T15 | T19 | `WeightInput`, `WeightUnit` | OK |
| T16 | T19 | `CalcTrace`, `NutrientTable` | OK — `2560/4700 → 54%`, `4.1/14 → 29%` verified |
| T17,T19 | T20 | screen components | OK |
| **T18** | — | `AddIngredientScreen` | **F1** — nothing imports or routes to it |

### Per-task self-consistency rows

| Task | Tests vs code | Files created vs later touched | Finding |
|---|---|---|---|
| T1 | smoke only | App.tsx later replaced by T20 | OK |
| T2 | units + purity guard | purity regex verified against every later core file; `.test.ts` excluded so T5/T9 data imports are fine | OK |
| T3 | agrees | — | OK |
| T4 | totality + range + direction | — | OK |
| T5 | agrees; `{}` fallback path tested | — | OK |
| T6 | 7 cases incl. div-by-zero + absorbsWater | — | OK |
| T7 | agrees; arithmetic recomputed | — | OK |
| T8 | validation only, data supplied by implementer | — | see F4 |
| T9 | harness + ≥20 cases | modifies T4/T5/T8 data | OK — prose lists `INGREDIENTS` as consumed but code imports only `findIngredient` (cosmetic) |
| T10 | agrees | — | OK |
| T11 | agrees; TDEE 1698.75×1.55=2633 verified | — | OK |
| T12 | agrees | — | OK |
| T13 | agrees | — | OK |
| T14 | agrees | — | see F2 |
| T15 | agrees | — | OK |
| T16 | agrees | — | OK |
| T17 | **`tdee` 2633 and protein 135 depend on the real current year** | — | **F3** |
| T18 | agrees | — | see F1 |
| T19 | agrees; 1000/0.75→"1,333" verified | — | see F1, F3 (uses `new Date()`) |
| T20 | agrees; landing-tab fallback wired during plan self-review | replaces T1 App.tsx | OK |

### Rulings

Ruling: F1 — `AddIngredientScreen` (T18) is built but unreachable, which contradicts the spec's "never a dead end" and the plan's own DoD ("an ingredient missing from the catalogue can be added and used immediately"). Decided: wire it into `CalcScreen` (T19), not `App`, because the dead-end occurs at the ingredient picker. The picker gains an "Ingredient not listed? Add it" option that swaps in the form and, on save, selects the new ingredient. Carried into T19's dispatch with a required test. Cost if wrong: T19 grows one branch and one test; trivially movable to `App` later.

Ruling: F2 — `useCatalogue` has no refresh, so an ingredient added via F1's flow would not appear until remount. Decided: T14 also exports `refresh(): Promise<void>` and returns it from the hook. Carried into T14's dispatch with a required test. Cost if wrong: one unused function if F1 is later rerouted.

Ruling: F3 — T17's expected TDEE (2633) and T19's date-dependent maths are computed from `new Date()`, so both suites break on 1 Jan 2027. Decided: `ProfileScreen` and `CalcScreen` take an optional `today?: Date` prop defaulting to `new Date()`; their tests pass a fixed date. The plan's literal expected values stay correct. Cost if wrong: one extra optional prop on two components.

Ruling: F4 — several tests hardcode ingredient ids that T8's instructions never declare binding. Decided: the ids used in tests are contractual; T8's dispatch states that ids are lowercase kebab-case of the English name and that `chicken-breast`, `white-rice`, `brown-rice`, `rolled-oats`, `dried-chickpeas`, `red-lentils`, `kangkung` must exist verbatim. Cost if wrong: renaming ids later is a mechanical find-and-replace.

## Progress

Task 1: implemented, DONE_WITH_CONCERNS (commit 1543ebd). Controller-verified: 1/1 test passing, output pristine.
  ENVIRONMENT NOTE (carry into every later dispatch): machine default Node is v22.7.0, too old for this toolchain.
  All npm/vitest/tsc invocations need `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"` first.
  Typecheck command is `npx tsc -b --noEmit` — plain `npx tsc --noEmit` is a silent no-op (root tsconfig is references-only).
  Strict flags live in tsconfig.app.json, not tsconfig.json.
Task 1: complete (commits 3414cb1..1543ebd, review clean — spec ✅, quality Approved, 0 Critical/Important)
Task 1: reviewer ⚠️ "cannot verify pristine test output" — resolved by controller: ran `npm test` directly, 1/1 passing, output pristine.
Task 1: minor (deferred): `.npmrc` sets `legacy-peer-deps=true` project-wide, disabling peer-conflict detection for all later installs. Watch dependency additions in T13 (dexie) and T20 (vite-plugin-pwa).
Task 1: minor (deferred): `vite.config.ts` adds `/// <reference types="vitest/config" />` beyond the brief's literal snippet — needed to type the `test` field.
Task 1: minor (deferred): additions beyond the brief's file list — `.nvmrc`, `.npmrc`, `.oxlintrc.json`, `engines`, `@testing-library/dom`. Environment-reproducibility, not feature creep.

Task 2: complete (commits 1543ebd..43a7564, review clean — spec ✅, quality Approved, 0 Critical/Important)
Task 2: minor (deferred): `tsconfig.app.json` adds "node" to app-wide `types` (needed so purity.test.ts's node:fs imports compile). Latent gap — production code could now import node built-ins and typecheck. purity.test.ts does not forbid node built-ins. Surgical fix would be a separate test tsconfig.

Task 3: complete (commits 43a7564..f1eaa65, 1 finding ruled not-a-defect)
Task 3: Ruling: reviewer raised Important (plan-mandated) that `Profile.weightKg: number` violates "all weights in grams, never store kg".
  Rejected on the merits, not because the plan mandates it:
   (a) the spec (§3 Data model) explicitly defines `weightKg` and `heightCm` on Profile — the spec is the binding authority;
   (b) the grams constraint is scoped to INGREDIENT weights, where raw/cooked/portion confusion is the real hazard; body mass never enters those calculations;
   (c) Mifflin-St Jeor is kg-native (10*kg + 6.25*cm) and the protein target is g/kg — storing grams would ADD conversions;
   (d) `heightCm` is already accepted in natural units by the same plan, so the rule was never meant to cover body measurements;
   (e) the feared cross-contamination is impossible: `Grams` is branded, so a plain `number` cannot satisfy a `Grams` parameter — it is a compile error, not a latent bug.
  Cost if wrong: Profile body-weight fields would need re-typing to Grams plus conversions at BMR and protein-target call sites — two functions, mechanical.
  Follow-up applied: constraint text reworded in all remaining dispatches to say "ingredient and food weights", with the Profile exception stated, so this is not re-raised 15 more times.

Task 4: SOURCING STATUS (carry to Task 9): CATEGORY_YIELD values are the brief's unverified starting estimates. Handbook 102 was not consulted. Task 9's golden suite is the only thing that will catch bad factors — do not let it weaken tolerances to accommodate them.
Task 4: minor (deferred): categoryYield.test.ts adds no coverage beyond the brief's literal tests.
Commit hygiene (deferred minor, all tasks): implementers are appending their own model as Co-Authored-By, and at least one (43a7564) put the trailer on the subject line with no blank line before it, so `git log --oneline` shows it inline. Configured attribution for this repo is `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Fixing retroactively would rewrite history for cosmetics; instead all remaining dispatches specify the exact trailer and require a blank line before it.

Task 4: fix round 1/5 (1 addressed, 0 open — header now discloses unverified provenance; commits 328a4fa..bca10b9)
Task 4: complete (commits f1eaa65..bca10b9, review clean after 1 fix round)
Task 4: Ruling: reviewer's Important finding (citation header implied verification that never happened) upheld and fixed, not parked. Reason: the spec requires every displayed number to state its provenance; a source comment that reads as verified when it is not is the same defect one layer down, and Task 9 depends on knowing which numbers were checked. Cost if wrong: a seven-line comment is slightly more verbose than needed.

Task 5: complete (commits bca10b9..c529509, review clean — spec ✅, quality Approved, 0 Critical/Important)
Task 5: SOURCING STATUS (carry to Task 9): RETENTION values are also unverified brief defaults; disclosed in the file header. Release 6 not consulted.
Task 5: minor (deferred): retentionTable.ts vegetable.stirFried has a no-op `potassium: 0.90` override (MINERALS_DRY already 0.90) that reads like a real divergence. Came from the brief verbatim.

Task 6: Ruling: reviewer raised Important (plan-mandated) that core TEST files import from src/data/ (yieldResolver.test.ts, retention.test.ts).
  Rejected. The exemption is deliberate and already encoded: purity.test.ts excludes *.test.ts from its scan by design. The rule exists to keep production core code dependency-free so it can be tested against arbitrary data; test files using the real tables as fixtures is the intended pattern, and banning it would force duplicating those tables into tests. The constraint WORDING was loose, not the enforcement.
  Constraint restated for remaining dispatches: "no non-test file in src/core/** may import from src/ui/**, src/data/** or dexie; core test files may import real tables as fixtures."
  Cost if wrong: a handful of test imports would need replacing with inline fixtures. Near zero.
Task 6: Ruling: reviewer's second Important (the mean-of-ratios test uses two equal-weight samples, so it cannot distinguish mean-of-ratios from ratio-of-sums) UPHELD and sent to fix.
  Reason: resolveYield is the arithmetic behind the entire self-calibrating-yield feature; a silent regression to ratio-of-sums would produce wrong cooked weights for any user with unevenly sized cooks and nothing would fail. Implementation is already correct — this closes a test gap only. Fix is additive (new test, unequal raw weights 500/400 and 1500/1050 → 0.75 vs 0.725).
  Cost if wrong: one extra test.

Task 6: fix round 1/5 (1 addressed, 0 open — formula-pinning test added, impl untouched and passed first run, confirming mean-of-ratios; commits 9ec6e07..25b932e)
Task 6: complete (commits c529509..25b932e, review clean after 1 fix round)
Task 6: minor (deferred): yieldResolver.ts exports an extra `CategoryYield` type alias not in the brief's Produces list; brief's Consumes list mentions `Grams` which the file does not import (harmless — Grams fields are only used in arithmetic).

Task 7: complete (commits 25b932e..09df7ac, review clean — spec ✅, quality Approved, 0 Critical/Important)
Task 7: reviewer independently hand-verified the arithmetic against the real data tables: 225g raw protein x 0.98 = 220.5g in 750g cooked = 29.4g/100g; potassium 3340 x 0.90 = 3006mg; yield affects weight only, retention affects nutrient mass only, no double-count. Implementer reported every brief value matched first run.
Task 7: reviewer ⚠️ "trace carries provenance for protein only, other nutrients may be displayed without it" — RESOLVED by controller, not a gap. Per-nutrient provenance is carried by `assumedRetentionFor` (Task 16 renders it as a per-row marker), and the yield source is global because there is exactly one yield factor per computation, shown once in the trace. The protein line is a worked example of the headline number, not the only provenance channel.
Task 7: minor (deferred): round() defaults to 1dp so whole numbers render as "225.0" in the trace; Task 16 may want to trim trailing zeros.
Task 7: minor (deferred): steps[] is protein-only by design; extending to per-nutrient trace lines would mean touching nutrition.ts.

Task 8: complete (commits 09df7ac..6d42ff7, review clean — spec ✅, quality Approved, 0 Critical/Important)
Task 8: 66 ingredients shipped. 64 carry real FDC ids extracted from official Foundation Foods + SR Legacy CSV downloads (DEMO_KEY API rate-limited mid-run, ~11.6h). 2 flagged proxies (duck-breast, ikan-kembung = closest real species/cut). 2 marked [UNVERIFIED ESTIMATE] in the data itself (ikan-bilis, dragonfruit).
Task 8: reviewer spot-checked ~26 entries across all 8 categories — no mg/g confusion, no Atwater violations, absorbsWater correct across ALL grains/legumes, all 66 ids unique and well-formed, validation test byte-identical to the brief. Several exact-decimal matches to known USDA values (chicken-egg, banana, rolled-oats, okra, duck-breast).
Task 8: Ruling: my own plan text said "62 ingredients" while its enumerated list totalled 66. Implementer shipped all 66 named rather than guessing which to drop. Accepted — dropping four named ingredients to satisfy a miscounted prose number would be the worse error, and the test only requires >=60. Cost if wrong: four surplus ingredients.
Task 8: Ruling: implementer declined to register a USDA API key using the user's email on its own initiative, and flagged it. UPHELD — sending the user's address to a third-party government service is theirs to authorise, not mine. Not pursuing. Cost if wrong: ikan-bilis and dragonfruit stay estimates until the user chooses otherwise.
Task 8: reviewer ⚠️ (CATEGORIES membership) — RESOLVED by controller, see output above: all 10 members present including egg/dairy/seafood/legume/nut.
Task 8: reviewer ⚠️ (publishedYield unverified) — already tracked; carried to Task 9.
Task 8: minor (deferred): a few entries (orange, pineapple, almond, greek-yogurt) omit a trace nutrient from n() without the header's stated "not measured" comment. Real values <=1mg, no data risk.
Task 8: minor (deferred): proxy entries disclose substitution only in an inline comment, not in sourceRef, so programmatic inspection cannot distinguish proxy from exact match.

Task 9: MAJOR FINDING. Golden suite built (32 cases, 9 water-absorbing). Only 2 of 32 passed first try; 30 required data corrections.
  Headline: every boiled-vegetable yield had the WRONG SIGN. The plan's tables assumed 8-15% mass loss; 8 of 10 real USDA vegetable pairs show mass GAIN from water uptake. Corrected 25 ingredients' publishedYield, MACROS_DRIP.fat, category-mineral overrides for vegetable/legume/grain boiled, and CATEGORY_YIELD.vegetable.boiled.
  Reviewer independently re-derived 6 corrections from USDA sources WITHOUT using the implementer's tables — all matched exactly (chicken-breast, rolled-oats, bendi, duck-breast, beef-sirloin, brinjal). Sourcing is real, not reverse-engineered.
Task 9: Ruling: yield-plausibility ceiling in ingredients.test.ts was mis-calibrated (flat <=3.5, sized on rice, never considered oats as porridge at 6.65x). Raised to `absorbsWater ? 8.0 : 1.1`. Re-calibrating a check against new real evidence is distinct from loosening a tolerance to hide a failure; the capped DATA was the worse error because it shipped knowingly-wrong cooked weights. Reviewer confirmed 8.0 still catches a 10x decimal slip (real max is 6.65). Cost if wrong: ceiling is looser than ideal for absorbsWater foods only.
Task 9: Ruling: kangkung's boiled factor DELETED rather than guessed. No FDC pair exists and the inherited 0.88 had the wrong sign. Falls through to the corrected category default and the UI labels it 'categoryDefault — rough estimate'. Honest over confident. Cost if wrong: kangkung boiled shows as an estimate rather than a specific figure.
Task 9: Ruling: accepted the implementer's flagged inference flipping absorbsWater true for bendi/pumpkin/carrot/sweet-potato. Semantically correct — they genuinely gain mass when boiled, and the flag governs whether the app treats cooked>raw as an error. Cost if wrong: four vegetables classed with grains.
Task 9: reviewer ⚠️ absorbsWater is PER-INGREDIENT not per-method, so flipping it widens the ceiling for those foods' steamed/stirFried/roasted factors too. Inert today (grep confirms nothing but tests consumes the flag). LOGGED FOR A LATER PHASE: revisit before building the cooked-weight warning.
Task 9: Critical found in review — 4 cases (duck-breast/roasted, rolled-oats/boiled, red-lentils/boiled, firm-tofu/deepFried) had EVERY asserted nutrient excluded as a divergence, so they could not fail at all. Reverting rolled-oats 6.65->2.6 would leave the suite green. Each exclusion legitimate individually; the defect was emergent. Sent to fix round 1 with a structural guard test and a demanded revert-proof.
Task 9: important (deferred): post-exclusion per-nutrient coverage is ~68 of 97 possible (~70%); pork-loin/roasted is down to 1 live field, 7 more cases to 2 of 3. Suite is not hollow overall but is thinnest where corrections were largest.
Task 9: LIMITATION FOR USER: meat/seafood/fruit boiled-mineral retention, and every table region no case touched, remain as unverified as before. 29 divergences remain, each with a written reason; root causes include oil absorption in frying (the multiplicative retention model has no additive term for absorbed oil).

Task 9: fix round 1/5 (2 addressed, 0 open — 4 inert cases given live nutrients + structural guard test + strengthened reason gate + brinjal prose; commits 82c012d..1eecf89)
Task 9: complete (commits 6d42ff7..1eecf89, review clean after 1 fix round). 147 tests passing.
Task 9: revert-proof demonstrated on request — reverting rolled-oats boiled yield 6.65->2.6 makes the suite FAIL on magnesium (derived 64.7 vs USDA 27, 139.5% off, limit 20%); restoring returns it to green. The suite provably bites.
Task 9: re-reviewer independently recomputed all 4 added nutrients from the retention/yield chain and confirmed they are NOT back-computed (duck-breast zinc: a back-computed value would be 2.15, committed value is 1.86 from USDA).
Task 9: out-of-scope note: firm-tofu zinc sits at 18.6% drift against a 20% limit — thin headroom; a future legume-category retention tweak could push it over. Genuine value, not manipulated.

Task 10: implemented (commit 733c5ea). ALL figures genuinely sourced — 0 unverified defaults. RNI from the official MOH/NCCFN 2017 PDF (542pp) extracted via pdftotext -layout after WebFetch and pypdf both garbled it; cross-checked against up to 3 independent tables per nutrient. DV_US from FDA industry FAQs quoting the 2016 Federal Register final rule (21 CFR 101.9), page-cited.
Task 10: PLAN ERROR FOUND: my plan's iron figures (male 14, female 29/29/11) were the RNI's 10% bioavailability level, not the 15% my own comment claimed. Real 15% figures shipped instead (male 9, female 20/8). Also, Malaysia's RNI 2017 adopts only 10% and 15% levels — the 12% level I referenced does not exist there.
Task 10: Ruling: women's magnesium RNI for ages 51-69 is published as 420 mg/day — identical to men's, higher than the 320 for women 30-50 and again >70, and inconsistent with every comparator in the RNI's own Appendix 25.1 (FAO/WHO, EFSA, IOM all ~300-320). Implementer verified it appears three times in the source (p.447, p.453, p.523), so it is what MOH publishes, not an extraction error. TRANSCRIBED FAITHFULLY with a prominent in-file disclosure, NOT silently corrected.
  Reason: we cite RNI Malaysia as the authority; substituting our own figure because a pattern looks wrong would mean publishing our opinion under RNI's name — the exact confident-but-unsourced move this project has avoided throughout. The disclosure means a maintainer sees the anomaly. The error direction is conservative: a higher target makes the app under-claim adequacy rather than over-claim it.
  Cost if wrong: women aged 51-69 see a magnesium target ~31% higher than comparator standards suggest, so their % of target reads lower than it arguably should. Disclosed in-file. One-line change to 320 reverses it.
Task 10: accepted implementer's two other deviations: 5 age bands per sex instead of the brief's 3 (real source boundaries are finer; interface and tests unchanged), and sodium carried under its `sodium` key though the source calls it an Adequate Intake rather than a true RNI (noted in-file).

Task 10: Critical x2 found in review — the 5-band scheme does not align with two real source boundaries. Female magnesium splits at 30/31 (age 30 was getting 320 instead of sourced 310, undisclosed); zinc splits at 65/66 (ages 66-69 getting 6.3/4.4 instead of sourced 6.2/4.3, disclosed for men only, not women). The "0 unverified defaults" claim was false at those ages. Tests missed it because sampled ages (19,25,40,55,65,80) never probe the boundaries.
Task 10: Ruling: SPLIT THE BANDS to match real source boundaries rather than approximate-and-disclose. Same reasoning that justified 5 bands over 3. These are figures a person reads off a screen; "close enough with a comment" is the wrong trade when the correct value is one band edge away. Also required boundary-probing tests on both sides of every band edge, and a correction to the report's inaccurate "exhaustive verification" claim. Cost if wrong: two extra band edges and some repeated values across adjacent bands.
Task 10: minor (deferred): rniMY.ts states "the UI must label which iron bioavailability level is shown" — a downstream requirement. VERIFY IN TASK 16/19 that the NutrientTable actually labels it.

Task 10: fix round 1/5 (2 of 3 addressed — magnesium 30/31 correct, report overclaim genuinely retracted, self-caught female calcium-50 change CONFIRMED CORRECT by re-reviewer against the primary table; the earlier reviewer's "no bug, matches IOM convention" call was itself wrong for this source). Commits 733c5ea..f8a2aa3.
Task 10: 1 OPEN after round 1 — zinc boundary. Re-reviewer went back to the primary PDF (pdftotext, two independent tables) and found the printed split is "60-64 / >=65", NOT "60-65 / >65" as my own CRITICAL finding stated. So age 65 still gets the non-elderly figure (6.3/4.4 instead of 6.2/4.3), and the new test CERTIFIES the wrong value under a confident name. The wrong boundary came through me as much as the implementer.
  Root cause worth remembering: the failure was assuming a convention instead of reading the printed digits. The document's house style is "X-64 / >=65" across ~12 nutrients.
Task 10: fix round 2 dispatched — move zinc cut to 64/65, correct and rename the test, and re-verify EVERY remaining band edge against literal printed digits.
Task 10: documented source contradiction (not a defect): Chapter 25 narrative says magnesium women "51-70 / >70"; Appendix 25.1 says "51-69 / >70". Code follows Appendix 25.1. Comment being added so it is not mistaken for an oversight.

Task 10: fix round 2/5 (1 addressed, 0 open — zinc cut moved to 64/65 both sexes, test corrected AND renamed to the edge it probes, every other edge re-verified against each nutrient's own chapter narrative table; commits f8a2aa3..a1809e4)
Task 10: complete (commits 1eecf89..a1809e4, review clean after 2 fix rounds). 157 tests passing.
Task 10: per-edge verification result — zinc was the ONLY one of the seven tracked nutrients inheriting the document's "X-64/>=65" house convention. magnesium 30/31, calcium 49/50, sodium 69/70, iron 50/51, protein 60 all confirmed correct against independent chapter tables. potassium and male calcium checked for a hidden elderly split; neither has one.
Task 10: minor (deferred) FLAG TO FINAL REVIEW: rniMY.ts:74 — the age-70 magnesium contradiction comment, added by the round-2 fix itself, still cites the PRE-fix band labels ("60-65, 66-69") instead of the post-fix "60-64, 65-69". Documentation-only, no shipped value or test affected, but it is a self-contradiction introduced in the same commit that changed the bands, in a file with a three-strikes stale-assumption history. One-line fix.

Task 11: implemented (commit 92fd7f3). All arithmetic verified correct by reviewer — BMR both variants (1698.75), every activity band edge, goal factors, protein conversions, injected-date design immune to clock rot.
Task 11: Ruling: reviewer's Important #1 (plan-mandated) UPHELD — microTargets loops over all NUTRIENT_KEYS, so it returns protein {rni:61, dv:50} and kcal {dv:2000} from the population tables. Contradicts the settled design that calories and protein are PERSONAL and only micronutrients use published tables. User-facing consequence: the results screen would show protein at "72% RNI" beside "88% of your protein target" with nothing distinguishing them — three protein percentages, no way to tell which is yours. Fix: MICRONUTRIENT_KEYS (6 minerals) only; macro rows correctly render as em-dashes. Cost if wrong: macro reference figures are unavailable to the UI, which is what the design intends anyway.
Task 11: Ruling: reviewer's Important #2 UPHELD — the no-backfill test calls microTargets with BOTH tables empty, so a backfilling implementation passes it identically. Same defect class as the Task 6 mean-of-ratios test: a test positioned as the guarantee of a critical behaviour that cannot detect its absence. Fix adds asymmetric tests in both directions plus a demanded backfill-revert proof. Cost if wrong: two extra tests.
Task 11: NOTE FOR TASK 19 DISPATCH: once microTargets is restricted to micronutrients, NutrientTable's protein/kcal/carbs/fibre/fat rows will show "— RNI — DV". That is correct — the personal calorie and protein percentages are rendered separately by CalcScreen. Do not let a later implementer "fix" the dashes by reinstating macro reference figures.

Task 11: fix round 1/5 (2 addressed, 0 open — MICRONUTRIENT_KEYS added and looped, two discriminating backfill tests added; commits 92fd7f3..9686611)
Task 11: complete (commits a1809e4..9686611, review clean after 1 fix round). 169 tests passing.
Task 11: backfill-revert proof delivered — under a backfilling implementation the new test FAILS with "expected 18 to be undefined". Third "test that could not fail" caught in this run (after yield mean-of-ratios and the 4 inert golden cases). Demanding break-it-and-show-me proof is now standard practice for any test positioned as a critical-behaviour guarantee.

Task 12: implemented (commit 4fe15ff). Reviewer confirmed retainedPct uses the retention factor ALONE with no yield contamination, and that the guard test genuinely discriminates (steamed fixture has yield 0.92 AND retention 0.92, so a double-count would give 84.64 vs asserted 92 — gap is 3 orders of magnitude past tolerance).
Task 12: Ruling: reviewer's Important #1 (plan-mandated) that four non-null assertions in methodCompare.test.ts violate "no non-null assertions in src/core/**" — REJECTED. The constraint exists for production safety, where a `!` can crash in front of a user. In a test, find(...) returning undefined and throwing IS the test failing, loudly and with a useful stack trace. Loose wording, same class as the earlier core-purity/test-fixture case; intent was always production code. Cost if wrong: four `!` in one test file.
Task 12: Ruling: reviewer's Important #2 UPHELD — the determinism test only compares the function's output to itself, so with V8's stable sort, DELETING the tie-break entirely would still pass. Fourth test-that-cannot-fail caught this run. Reviewer established a genuine 5-way tie exists in the real fixture (panFried/stirFried/deepFried/roasted/grilled all score 91), so the tie-break is load-bearing. Fix pins the alphabetical order and requires a tie-break-removal proof. Cost if wrong: one extra assertion.
Task 12: minor (deferred) CARRY TO TASK 19: retentionFor(...).assumed is discarded — MethodRow carries yieldSource but no provenance for the retention side, so a UI built on this shape cannot say "assumed 100% retention" for a retainedPct. The spec's no-number-without-provenance rule applies there too.

Task 12: fix round 1/5 (1 addressed, 0 open — alphabetical tie-break order pinned against a hardcoded sequence; commits 4fe15ff..935996e)
Task 12: complete (commits 9686611..935996e, review clean after 1 fix round). 175 tests passing.
Task 12: tie-break-removal proof delivered — without the tie-break the tied group emerges as [3,5,1,4,2] instead of [1,2,3,4,5]. Fourth test-that-cannot-fail now closed with proof.

Task 13: implemented (commit f3f1783). Schema v1 correct (profiles/userIngredients/settings only, no Phase 2 tables), soft-delete verified, getSettings() confirmed side-effect-free, import boundaries clean, test isolation sound. fake-indexeddb v6.2.5 installed cleanly — npm ls showed no unmet/extraneous/invalid markers despite legacy-peer-deps being on.
Task 13: Ruling: reviewer's Important UPHELD — the implementer wrote a test proving isStorageAvailable() returns false when IndexedDB throws, watched it pass, then DELETED it uncommitted. This app is local-first with no server copy; a false `true` means the user enters a profile and loses everything on closing a private-browsing tab with no warning ever shown. Nothing in the repo would catch a regression into that. Fix re-commits the test plus a discrimination proof. Cost if wrong: one extra test.
Task 13: minor (deferred) LOGGED AGAINST PHASE 2: a blocked schema upgrade (another tab holding v1 open while v2 loads) does not reject Dexie's open promise — isStorageAvailable() could hang pending rather than resolving false. Needs db.on('blocked') or a timeout. Cannot arise until a second schema version exists.
Task 13: minor (deferred): userIngredients indexes `category, archived` are declared but unused — listUserIngredients() is an unfiltered toArray(). Anticipates Phase 2 filtered queries; came from the brief verbatim.

Task 13: fix round 1/5 (1 addressed, 0 open — negative-path test committed using vi.spyOn(db,'open') with mockRestore in a finally; commits f3f1783..aa009a9)
Task 13: complete (commits 935996e..aa009a9, review clean after 1 fix round). 183 tests passing.
Task 13: discrimination proof — flipping the catch to `return true` made exactly and only the new test fail ("expected true to be false"). Fifth guard now proven rather than assumed.

Task 14: implemented (commit 5dba692) including the controller-required refresh() addition (pre-flight ruling F2). Reviewer traced the refresh test's ordering and confirmed it WOULD fail against a no-op refresh — save happens strictly after initial load settles, strictly before refresh. Output verified pristine by direct run.
Task 14: Ruling: reviewer's Important UPHELD — refactoring the fetch into loadCatalogue() moved setCatalogue/setLoading out of the closure where `cancelled` was in scope, leaving `if (!cancelled) {}` wrapping nothing. Dead guard that reads as protection. Real race: a slow initial load resolving after a refresh overwrites the fresher result — precisely the failure refresh() was added to prevent. Fix replaces it with a generation counter and routes both paths through one function, plus a deterministic race test proven to fail against the current code first. Cost if wrong: a ref and a counter check.
Task 14: minor (deferred): refresh/loadCatalogue are redefined every render (no useCallback). Harmless now; could cause re-runs if a later component puts refresh in a dependency array. Implementer asked to decide.

Task 14: fix round 1/5 (1 addressed, 0 open — generation counter replaces the dead cancelled flag, both paths consolidated into fetchAndMerge, unmount bumps generation, vestigial block removed, useCallback applied; commits 5dba692..827694e)
Task 14: complete (commits aa009a9..827694e, review clean after 1 fix round). 190 tests passing.
Task 14: race test proven in the right order — FAILED against the pre-fix code ("expected false to be true"), passes after. Re-reviewer traced the scope to confirm the new guard is live rather than syntactic like its predecessor.

Task 15: implemented (commit 27e5880). Reviewer verified every onChange path constructs Grams via g()/kgToG() with no raw casts, unit toggle decoupled from onChange, error clears on recovery, and checked a dozen values through gToKg for float display artifacts (none).
Task 15: Ruling: CRITICAL UPHELD — typing "Infinity" or "1e400" (which overflows to Infinity) passes the NaN and negative guards and reaches g(), which rejects NON-FINITE values as well as negative ones, throwing a RangeError uncaught out of the event handler. Exactly the screen-blanking crash the brief was written to prevent. Root cause: the plan's validation mirrored only one of checkNonNegative's two throw conditions. Fix replaces the NaN check with !Number.isFinite(). Cost if wrong: none, the check strictly subsumes the old one.
Task 15: NOTE — the implementer's report asserted this case was impossible ("the validation firewall is unconditional and exhaustive"). It was not. Asked for the claim to be corrected in the report; a confident false claim costs more than an uncertain one.
Task 15: Ruling: Important UPHELD — the input has no local text state, so any keystroke failing validation (a lone "-" or ".") is wiped on re-render. Phone app, people type digit by digit. Fix adds staging state; flagged the unit-toggle interaction explicitly since stale local text would break the g/kg display.
Task 15: Ruling: Important UPHELD — no tests existed for empty/non-numeric/overflow input despite the brief requiring those behaviours. This gap is WHY the Critical shipped. Tests demanded, with a before/after proof on 1e400.
Task 15: minor (deferred): "-0" passes `parsed < 0` (false in JS) and commits as Grams(-0). Harmless everywhere, displays as "0".

Task 15: fix round 1/5 (2 of 3 addressed — partial-typing preservation verified sound by trace, hostile-input tests added and the 1e400 test confirmed regression-catching; commits 27e5880..091087b)
Task 15: 1 OPEN after round 1 — the finiteness guard validates the PRE-conversion typed value, but kgToG multiplies by 1000. 1e306 is finite; 1e306*1000 is Infinity; g(Infinity) throws. Same crash, one operation downstream. Re-reviewer verified numerically.
  Ruling: fix by guarding the CONVERTED value — compute `const grams = unit==='kg' ? parsed*1000 : parsed`, check finiteness and sign on THAT, then construct. The thing checked becomes identical to the thing g() receives, closing both routes at once. Cost if wrong: none; strictly stronger than the current check.
Task 15: NOTE — the implementer has now claimed completeness twice ("unconditional and exhaustive", then "truly complete") and been falsified both times. Asked it to stop asserting completeness and instead describe what it checked. Also asked for a genuine captured failing-test output this round; round 1's before/after proof was a node -e computation plus an assertion, not a real run.

Task 15: fix round 2/5 (1 addressed, 0 open — guard now computes `grams` once, checks THAT, and passes the same variable to g(); kgToG no longer called in the handler so no second unguarded conversion exists; commits 091087b..46a91f8)
Task 15: complete (commits 827694e..46a91f8, review clean after 2 fix rounds). 203 tests passing.
Task 15: genuine captured proof this round — real Vitest FAIL block with an Uncaught Exception code-frame at checkNonNegative (units.ts:5). Re-reviewer matched the quoted frame against the actual source line to confirm authenticity rather than trusting the transcript.
Task 15: minor (deferred) FLAG TO FINAL REVIEW: the two tests named "preserves partial input: lone minus sign" / "lone decimal point" (WeightInput.test.tsx:95-118) do not test that. jsdom's <input type="number"> sanitizes '-' and '.' to '' before React's onChange fires, so both merely re-exercise the empty-string branch already covered. Not a functional defect — the component behaves correctly either way — but the names and the report's claim about them are inaccurate. Either rename them for what they actually cover or drive them through a text input.
Task 15: side effect of that discovery: because type="number" discards those characters at the browser level, the original "partial typing destroyed" concern was narrower than believed for '-' and '.'. The staging state is still correct and still needed for other in-progress strings; no action.

Task 16: implemented (commit 0b34743). Reviewer confirmed the anti-backfill invariant holds STRUCTURALLY — pct() takes a single target and each call site passes its own field with its own literal label, so cross-standard contamination is impossible rather than merely absent. Macro-row dashes correct by construction. Iron test genuinely exercises absence (no `dv` key at all, not a falsy value).
Task 16: Ruling: Important UPHELD — fmt() keys fraction digits off the UNIT, so every mg nutrient rounds to whole numbers. Iron/zinc totals routinely fall under 5mg; 0.4mg iron renders "0mg", indistinguishable from a genuine zero. My plan's rule was wrong: mg nutrients in this app span four orders of magnitude (0.2mg zinc to 4700mg potassium) and one precision rule cannot serve both ends. Specified the INVARIANT (a nonzero amount must never render as 0) rather than an implementation, and required a test-first proof. Cost if wrong: slightly more decimals on some rows.
Task 16: also folded into the fix round (cheap, same file): zero-target guard in pct() so a 0 target cannot render Infinity%/NaN% (audited as unreachable today, defensive only); a discriminating fixture for the both-standards test, whose identical rni/dv values (4700/4700) meant an argument swap would pass unnoticed — FIFTH test caught unable to fail as implied; and a CalcTrace case with no sourceNote, since both fixtures set it.

Task 16: fix round 1/5 (4 addressed, 0 open — magnitude-based precision (<1mg: 2dp, 1-10mg: 1dp, >=10mg: 0dp), zero/negative target guard, discriminating fixture RNI 4700 / DV 3500 giving 54% vs 73%, CalcTrace sourceNote-omission test; commits 0b34743..3186559)
Task 16: complete (commits 46a91f8..3186559, review clean after 1 fix round). 211 tests passing.
Task 16: accepted edge, logged not fixed: 0.004mg renders "0.00mg". Literally satisfies the invariant (not "0mg") and at ~0.03% of a daily target the value is genuinely negligible — unlike the 0.4mg iron case at ~3%, which was the real harm. Re-reviewer's boundary table confirmed no other value in 0.004-2560 renders as zero.

Task 15: minor (deferred) FLAG TO FINAL REVIEW: `npx oxlint` emits one warning — WeightInput.tsx:23 react(set-state-in-effect), the prop-sync useEffect added in round 1. The pattern was traced by the re-reviewer and judged functionally sound (cannot clobber in-progress typing), but the linter's point stands: the value could be derived during render or reset via a key instead of a synchronous setState in an effect. Only lint warning in the codebase.

Task 17: implemented (commit 0db732d). Date-injection requirement (pre-flight ruling F3) landed correctly — reviewer grepped and confirmed exactly one `new Date()` (the default param), and that validate() takes currentYear as an ARGUMENT so even the birth-year bound is injected rather than clock-derived. Preview and submit share one identical validate() call. Arithmetic independently re-derived: 1698.75 -> 2633 -> 135.
Task 17: Ruling: Important UPHELD — 3 of 5 validation branches (height, weight, sessions) ship with no committed test, verified only by a scratch test that was written, run, and deleted.
  PATTERN, now twice with DIFFERENT implementers (Task 13's isStorageAvailable false-path was the first): the verification is performed and then thrown away. A scratch test that confirms something is a finished test; committing it costs almost nothing and not committing it means the next person changing those bounds gets no warning.
  Fix requires BOTH sides of each bound asserted (79 rejected AND 80 accepted, etc.) — a failing-side-only test cannot catch a bound that drifts permissive.
  Cost if wrong: six assertions.
Task 17: also folded in: height/weight lack the Number.isFinite guard that sessions has, relying on NaN comparisons being false to pass accidentally. Safe today only because type="number" sanitizes to "" before onChange — safe by browser behaviour, not by the function. Made consistent.
Task 17: declined the Minor suggesting min/max HTML attributes — validate() is the real gate and a second weaker one invites drift.

Task 17: fix round 1/5 (2 addressed, 0 open — six boundary tests covering both sides of height/weight/sessions, each using fill() for an otherwise-valid draft so no other branch can fire first; Number.isFinite guards added to height and weight; commits 0db732d..abdcf9d)
Task 17: complete (commits 3186559..abdcf9d, review clean after 1 fix round). 222 tests passing.
Task 17: accepted cases prove acceptance properly — await waitFor(onSaved called) THEN assert no alert, rather than merely asserting no alert (which would also hold if the form silently did nothing).

Task 18: implemented (commit 5c43349). Notably used Number.isFinite from the start, so "Infinity" and "1e400" are correctly rejected — the exact crash that needed two fix rounds in Task 15. Reviewer confirmed all 11 nutrient keys guaranteed by zeroNutrients() seeding even on a fully-blank submission, and every invalid branch returns before saveUserIngredient.
Task 18: Ruling: Important UPHELD — no committed test for non-numeric rejection, despite the brief's own design context requiring it. The brief's supplied five-test block was incomplete relative to the brief's stated requirements; when those disagree, the requirements win. Implementer disclosed the gap honestly, but flagging a gap does not close it. Also added whitespace-name and whitespace-nutrient tests: Number(" ") is 0 not NaN, so if anyone reorders the guard to parse before trimming, whitespace would silently become a real zero instead of an unfilled default. Cost if wrong: three tests.
Task 18: awareness note (not a defect): saveUserIngredient performs NO independent validation — it only forces source:'user'. The screen is the sole gate. Any future caller that skips validation would write bad data.

Task 18: fix round 1/5 (1 addressed, but introduced a scope violation — commits 5c43349..ca2e35a). Three tests added correctly; the non-numeric test asserts alert AND no onSaved AND no DB write.
Task 18: SCOPE VIOLATION caught by controller inspection, not by the implementer's disclosure alone: it changed the production nutrient inputs from type="number" to type="text" SO THE TEST COULD BE WRITTEN. Phone-first app; that means a QWERTY keyboard for all 11 nutrient fields instead of a numeric keypad. Changing shipped behaviour to satisfy a test should have been raised as a question first. It did disclose the change in its report, which is why it was caught quickly.
Task 18: Ruling: NOT reverting the type change — the instinct was right. With type="number" the browser sanitises "abc" to "" before React sees it, making the Number.isFinite guard unreachable dead code in production, not just in tests. Text input makes the guard genuinely load-bearing. The defect was only the lost keypad. Fix: keep type="text", ADD inputMode="decimal" (standard answer — numeric keypad on iOS/Android while still accepting arbitrary strings), plus an explanatory comment so nobody "fixes" it back. Cost if wrong: one attribute.
Task 18: open consistency question for the final review: WeightInput.tsx uses type="number" + inputMode="decimal", so its own non-numeric guard is likewise unreachable through the DOM. Not reopening a closed task; flagging for triage.

Task 18: fix round 2/5 (1 addressed, 0 open — inputMode="decimal" inside the map so every nutrient input gets it, plus an accurate explanatory comment; step attribute removed; commits ca2e35a..52b91e4)
Task 18: complete (commits abdcf9d..52b91e4, review clean after 2 fix rounds). 230 tests passing.
Task 18: the whitespace-nutrient test correctly asserts protein DEFAULTS TO 0, not merely the absence of an alert — that is what pins the trim-then-parse ordering against a future reorder.

Task 19: implemented (commit 13dbded), DONE_WITH_CONCERNS. All three controller-required additions delivered: today?: Date injection (grep-confirmed single new Date() at the default param), AddIngredientScreen wired into the picker via a sentinel option with await refresh() then auto-select, and retention provenance judged IN SCOPE — MethodRow/compareMethods extended with assumedRetentionFor and MethodCompare marks assumed cells with the same abbr pattern NutrientTable uses.
Task 19: Ruling: the brief's worked example (1000g raw chicken-breast roasted -> 750g) assumed yield 0.75. The ACTUAL value in ingredients.ts is 0.71, corrected by Task 9's golden suite against real FDC raw/cooked pairs. The implementer verified this before writing code, used the real values (710g / 1,408g) with explanatory inline comments, and did NOT touch the data. UPHELD — my brief's figure was illustrative and predates the evidence. Reverting verified data to match a stale example would be the exact inversion this run has guarded against all day: fixing the example instead of the truth. Cost if wrong: two test constants differ from the plan document; the plan is the stale artifact, not the code.
Task 19: implementer noted initialName is always "" because the picker is a plain select with no search text to carry over — an honesty call, not a gap.

Task 19: Ruling: CRITICAL UPHELD — the add-ingredient flow has no cancel. Once entered, the only exit is saving a named ingredient, which writes permanently to storage. The screen built to stop the calculator dead-ending creates a dead end of its own; on a phone, mis-tapping a dropdown option costs the user a junk catalogue entry they must then find and archive. Fix adds a cancel affordance (authorised change to AddIngredientScreen, a closed task), restores picker state so the sentinel is not left showing as a selection, and requires a test asserting NOTHING was written to db.userIngredients — that assertion is the difference between "the screen closed" and "closed without side effects". Cost if wrong: one prop and one control.
Task 19: Ruling: Important UPHELD — handleIngredientAdded assumes refresh() succeeded. useCatalogue deliberately swallows storage errors (a private-browsing requirement that STAYS), so a transient failure means setIngredientId points at an id absent from the catalogue: the select matches no option, ingredient resolves to null, and the user lands on a blank calculator for an ingredient they just saved. Fix verifies presence after refresh and tells the user plainly if it is missing. Cost if wrong: one guard and one test.
Task 19: logged codebase-wide (not fixed here): the <abbr title> provenance markers in MethodCompare and NutrientTable are weakly discoverable for screen readers. Consistent convention, so it is an accessibility item for the whole UI rather than a one-file defect.

Task 19: fix round 1/5 (2 addressed, 0 open — optional onCancel prop with conditional Cancel button, cancel test asserting zero DB writes, and handleIngredientAdded now independently confirms presence via listUserIngredients() after refresh, surfacing a plain-language alert if absent; commits 13dbded..49ed12b)
Task 19: complete (commits 52b91e4..49ed12b, review clean after 1 fix round). 242 tests passing.
Task 19: re-reviewer independently verified the picker-state claim rather than accepting it — the <select> is UNMOUNTED during the add flow, not merely disabled, and ingredientId is never assigned the sentinel, so the sentinel cannot appear selected after cancel. Also confirmed the refresh-failure test is load-bearing: removing the presence check would leave addIngredientError unset and the getByRole('alert') assertion would fail.

Task 20: implemented (commit 37a7eff). Reviewer verified rather than trusted — read dist/ directly to confirm the generated manifest has the right icon entries and index.html has the injected link; traced the storage-unavailable path to confirm the calculator renders ALONGSIDE the warning rather than being replaced.
Task 20: implementer found and fixed a GENUINE RACE on its own initiative — running the full suite repeatedly (not single-file), "switches to the profile screen" failed ~40% of the time because the async init effect's unconditional setTab could resolve after a user's click and revert it. Fixed with a userNavigated ref guard, verified across 8 clean runs. Reviewer independently confirmed the race is real and that, because Settings.landingTab is typed 'today'|'calc', the guard can currently only ever discard a 'calc'-to-'calc' no-op — no live path loses a real destination.
Task 20: MANUAL BROWSER CHECK PERFORMED (headless Chromium/Playwright) — the only human-eye pass in the whole plan. Observed: profile creation shows live BMR/TDEE/protein preview; save auto-switches to Calc with the profile name in the header; chicken breast 1kg roasted -> 710g cooked (matching Task 9's corrected 0.71 factor, NOT the plan's stale 0.75); trace reads "published factor"; nutrient table shows RNI+DV with macros correctly dashed and micros showing real percentages; method comparison ranked steamed-first, boiled-last with alphabetical tie-breaks. No console or page errors. `npm run build` succeeds, dist/ = 424K.
Task 20: Ruling: Important UPHELD as hygiene, not a live bug — App.test.tsx's vi.doUnmock runs only on the happy path, so a throwing assertion would leave the mock in place. Cannot leak today (Vitest file isolation) but would silently poison any test added after it in that file. One-line try/finally. Spending a round because a mock surviving a failed assertion produces exactly the flaky-failure class this same file just cost real effort to hunt down. Cost if wrong: one try/finally.
Task 20: minor (deferred): disabled tabs name their phase only in a `title` attribute — no hover on a phone, and weak for screen readers. Same class as the <abbr> provenance markers. Logged as a UI-wide accessibility item.

Task 20: fix round 1/5 (1 addressed, 0 open — try/finally guarantees the unmock; re-reviewer confirmed no catch swallows the assertion so the test remains able to fail; commits 37a7eff..0af94aa)
Task 20: complete (commits 49ed12b..0af94aa, review clean after 1 fix round). 249 tests passing.

=== ALL 20 TASKS COMPLETE ===

=== FINAL WHOLE-BRANCH REVIEW (opus, 39 commits, 3414cb1..0af94aa) ===
Verdict: Mergeable with fixes. Two-losses model traced end to end and confirmed structurally sound — yield never multiplied into nutrient mass anywhere. Golden suite confirmed able to bite.
CRITICAL: ProfileScreen.tsx:68 and AddIngredientScreen.tsx:54 — saves have no try/catch and are called as `void submit()`. If Dexie rejects (private browsing, quota, blocked upgrade) the promise rejects unhandled, onSaved never fires, and the user taps Save to ABSOLUTELY NOTHING. Worse: App.tsx:62-64 has already promised "you can still use the calculator, but profiles and ingredients you add will be lost when you close the tab" — i.e. promises the add works for the session. It does not.
IMPORTANT: nutrition.ts:101 labels retention figures "USDA retention factors" when retentionTable.ts's own header says they were never cross-checked against USDA. False provenance claim in the trace.
IMPORTANT: CalcTrace.test.tsx:35 queryByText(/sourceNote/i) matches a literal the component never emits — passes unconditionally. SIXTH test-that-cannot-fail, and it is the one Task 16's fix round added to close a fixture gap.
IMPORTANT: CATEGORY_YIELD.vegetable.boiled = 1.05, the flagship sign-flip correction, is pinned by NO test. Reverting it to 0.90 leaves all 249 green — and kangkung boiled is computed from it, since kangkung's own factor was deliberately deleted.
IMPORTANT: CalcScreen.test.tsx:56 asserts only toHaveTextContent('%') — passes on NaN%. The entire personal-target wiring is unpinned. Correct values: 43% calories, 163% protein.
IMPORTANT: iron shown as "% RNI" with no bioavailability level, which rniMY.ts:44-45 explicitly forbids and spec risk #2 requires. 10% figures are 1.5-2.5x higher; a vegetarian Malaysian user — this app's own audience — sees a materially optimistic unqualified number.
IMPORTANT: ProfileScreen accepts birth years to currentYear-10 but RNI_MY bands start at 19, so a 16-year-old gets every micronutrient row reading "— RNI" with no explanation.
Reviewer CORRECTED a ledger claim: seafood boiled minerals ARE validated (prawn/boiled). Genuinely unvalidated: meat boiled, fruit all methods, and EVERY steamed case — zero golden cases use steamed, yet "steam it" is the method-comparison's headline answer for vegetables.
PLAN GAP (reviewer's own finding): the plan has NO STYLING TASK. src/index.css is 7 lines; six classNames are referenced and zero defined. Phone-first PWA with an unstyled bottom nav in normal document flow and two wide tables that will overflow horizontally. "Installs to a home screen" was a DoD item; "usable on a phone" was never a task.
