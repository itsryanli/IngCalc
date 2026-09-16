# IngCalc — Design Spec

**Date:** 2026-09-16
**Status:** Approved for planning

---

## 1. What this is

A phone-first, offline web app for working out what a raw ingredient becomes once
cooked: its cooked weight, its nutrients, its share of your daily calorie and
protein targets, and what it cost per gram of protein.

It follows one purchase through its whole life — bought at the market, cooked
(possibly in several sittings), split into portions, eaten — and records price,
location and date along the way so the spending can be exported and analysed.

### Goals

1. Convert raw weight to cooked weight, and show the arithmetic that produced it.
2. Report nutrients for any weight of an ingredient, raw or cooked, correctly
   accounting for both water loss and nutrient leaching.
3. Compare cooking methods by how much weight and how many nutrients they retain.
4. Compute per-person daily calorie and protein targets from body stats.
5. Track batches from purchase through cooking to consumption, with portions.
6. Record price, location and date, and report cost per portion and protein per MYR.
7. Export purchase and consumption history as CSV.

### Non-goals

Deliberately excluded. Each was considered and dropped.

| Excluded | Reason |
|---|---|
| Cooking-time model | No public data maps minutes to yield. Method + personal calibration replaces it. |
| Written cooking tips | Authoring folk wisdom, much of it false. Computed method comparison replaces it. |
| Backend, accounts, sync | Local-first. JSON backup covers the loss case. |
| Restaurant / branded food database | Manual quick-add covers non-home-cooked meals at a fraction of the cost. |
| Barcode scanning | Not needed for loose market produce, which is the main use case. |
| Charting libraries | Costs are a sortable table. |
| Recipes | A meal is a container of portions, not a recipe with steps. |
| `.xlsx` export | CSV opens in Excel. Revisit once the columns have proven themselves. |

---

## 2. Stack

- **React + TypeScript + Vite**, built as an installable static PWA.
- **Dexie** over IndexedDB for storage, with a versioned schema and migrations.
- **No export library.** CSV is written directly.
- **No backend.** Everything runs on the device.

TypeScript is load-bearing rather than incidental. The failure mode in this
domain is unit confusion — grams against kilograms, raw against cooked,
per-100g against per-portion, price-per-kg against price-paid — and those
produce plausible-looking wrong numbers rather than crashes. Branded types make
them build errors:

```ts
type Grams  = number & { readonly __brand: 'Grams' };
type MYR    = number & { readonly __brand: 'MYR' };
type IsoDate = string;  // 'YYYY-MM-DD'
```

Weights are stored in grams throughout. Kilograms exist only as a display and
input convenience, converted at the edge.

---

## 3. Data model

Units: `kcal` for energy, grams for macronutrients, milligrams for minerals.
All nutrient profiles are **per 100g of raw ingredient**.

```ts
type Category = 'vegetable' | 'meat' | 'seafood' | 'fruit' | 'grain'
              | 'legume' | 'dairy' | 'egg' | 'nut' | 'other';

type CookMethod = 'boiled' | 'steamed' | 'panFried' | 'stirFried'
                | 'deepFried' | 'roasted' | 'grilled';

type NutrientKey = 'kcal' | 'protein' | 'carbs' | 'fibre' | 'fat'
                 | 'potassium' | 'iron' | 'magnesium' | 'zinc'
                 | 'calcium' | 'sodium';

type NutrientProfile = Record<NutrientKey, number>;
```

### Ingredient — reference data

```ts
interface Ingredient {
  id: string;
  name: string;
  category: Category;
  per100gRaw: NutrientProfile;
  publishedYield: Partial<Record<CookMethod, number>>;
  absorbsWater: boolean;   // rice, pasta, dried legumes: yield > 1 is correct
  source: 'usda' | 'user';
  sourceRef?: string;      // FDC id, so any number can be traced back
  archived: boolean;       // referenced by batches, so never hard-deleted
}
```

Storing nutrients once, per 100g raw, and deriving cooked values means raw and
cooked can never drift out of agreement, and a user-added ingredient needs one
set of numbers rather than one per cooking method.

### Profile — one per person

```ts
interface Profile {
  id: string;
  name: string;
  sex: 'male' | 'female';   // an input to the BMR formula, which has two variants
  birthYear: number;
  heightCm: number;
  weightKg: number;
  sessionsPerWeek: number;  // 0–7+, drives the activity multiplier
  goal: 'cut' | 'maintain' | 'bulk';
  proteinGPerKg?: number;   // overrides the goal-derived default
}
```

`birthYear` was not in the original request but every credible BMR formula needs
age, and the calorie target is the figure everything else is measured against.

### Batch — one purchase, household-level

```ts
interface Batch {
  id: string;
  ingredientId: string;
  rawWeightG: Grams;
  rawRemainingG: Grams;     // decremented by each cook session
  purchase: { pricePaidMYR: MYR; location: string; date: IsoDate };
  createdAt: number;
}
```

Batches are household-level while meals are per-profile: you shop once for the
house but eat as an individual.

Batch state is **derived**, never stored — `raw` when no sessions exist,
`partiallyCooked` while `rawRemainingG > 0`, `cooked` when it hits zero,
`finished` when no portions remain anywhere.

### CookSession — one cooking event

```ts
interface CookSession {
  id: string;
  batchId: string;
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;     // measured by the user
  cookedRemainingG: Grams;  // authoritative remaining quantity
  cookedAt: IsoDate;
  portionCount: number;
  excludeFromCalibration: boolean;
}
```

**Grams are authoritative; portions are a view over them.** `portionWeightG` is
derived as `cookedWeightG / portionCount`, and `portionsRemaining` as
`cookedRemainingG / portionWeightG`. Eating one portion decrements
`cookedRemainingG` by `portionWeightG`; eating a weighed amount decrements it by
that amount. Without this the two `MealEntry` kinds would be tracking different
currencies, and a 100g serving from a 148g portion would have no defined effect
on the portion count.

A batch has many sessions. Cooking a whole pack at once is simply one session
consuming the full remainder — there is no separate code path for it, and the
cook form defaults `rawUsedG` to `rawRemainingG` so the common case is one tap.
When a batch has exactly one session, the UI renders it flat and the extra
structure never becomes visible.

**Calibration data lives here, not in a separate table.** A cook session already
records ingredient, method, raw weight in and cooked weight out, which is
precisely a yield observation. A dedicated `YieldObservation` entity — proposed
during design — was dropped as redundant; `excludeFromCalibration` handles the
bad reading (the day you forgot to drain it) without deleting the cook itself.

### Meal — per-profile, per-day

```ts
interface Meal {
  id: string;
  profileId: string;
  date: IsoDate;
  label: 'breakfast' | 'lunch' | 'dinner' | 'snack' | string;
  entries: MealEntry[];
}

type MealEntry =
  | { kind: 'portion'; cookSessionId: string; portions: number }
  | { kind: 'weight';  cookSessionId: string; grams: Grams }
  | { kind: 'quick';   label: string; kcal: number; proteinG?: number };
```

`portion` and `weight` entries decrement the session's remaining portions.
`quick` entries reference nothing and exist so a day can be completed without a
food database behind it.

### DayLog — target snapshot

```ts
interface DayLog {
  profileId: string;
  date: IsoDate;
  targets: {
    kcal: number;
    proteinG: number;
    micros: Partial<Record<NutrientKey, { rni?: number; dv?: number }>>;
  };
}
```

Written once, when the day's first entry is created. A day with no entries has no
`DayLog` and simply displays the profile's current targets. See §6 for why this
exists.

### Settings

```ts
interface Settings {
  activeProfileId: string;
  landingTab: 'today' | 'calc';   // defaults to 'today'
  defaultWeightUnit: 'g' | 'kg';
}
```

### Bundled reference tables

Static data, shipped with the app, not user-editable.

| Table | Shape | Source |
|---|---|---|
| `RNI_MY` | sex × age band → per nutrient | Recommended Nutrient Intakes for Malaysia (NCCFN/MOH, 2017) |
| `DV_US` | flat per nutrient | FDA Daily Values |
| `RETENTION` | category × method × nutrient → 0–1 | USDA Table of Nutrient Retention Factors, Release 6 |
| `CATEGORY_YIELD` | category × method → factor | USDA yield tables, averaged per category; fallback only |

---

## 4. Calculation core

Pure functions. No storage access, no React, no side effects. This is where the
tests live and where correctness is decided.

### Two separate losses

Conflating these is how nutrition apps get cooking wrong.

1. **Water loss** — mass leaves, nutrients stay. This is the yield factor.
   Protein does not vanish when chicken roasts; it concentrates into less weight.
2. **Leaching** — the nutrient itself is gone, into the cooking water. Boiled
   kangkung genuinely holds less potassium than raw kangkung, not merely less water.

Both are applied, in that order.

### Modules

**`units.ts`** — conversion at the edges, branded constructors, round-trip safe.

**`yieldResolver.ts`**

```ts
resolveYield(ingredient, method, sessions) => {
  factor: number;
  source: 'measured' | 'published' | 'categoryDefault';
  sampleCount: number;
}
```

Resolution order: the mean of the user's own cook sessions for that
ingredient + method (excluding flagged ones) if any exist; otherwise the
ingredient's published factor; otherwise the category default. The `source` and
`sampleCount` are surfaced in the UI — *"your average across 4 cooks: 0.72
(published: 0.75)"* — so the user always knows whose number they are looking at.

**`nutrition.ts`**

```ts
computeCooked(ingredient, rawG, method, yieldFactor) => {
  cookedWeightG: Grams;
  totals: NutrientProfile;
  per100gCooked: NutrientProfile;
  steps: CalcStep[];
}

interface CalcStep {
  label: string;
  detail: string;
  value: string;
  sourceNote?: string;
}
```

`steps` is a first-class output, not a debugging aid. The request was explicitly
to see *how it came to that amount*, so every result screen renders the trace:

```
Raw            1000g  ·  23.1g protein/100g  →  231g protein total
Yield (roasted)        × 0.75  (published; you have no cooks logged yet)
Cooked          750g
Protein retention      × 0.98  (dry heat, meat)
Protein         226g   →  30.2g per 100g cooked
```

That derived 30.2g/100g is worth noting: real cooked chicken breast measures
about 31g/100g. The model reproduces the known value rather than asserting it,
which is the basis of the golden-value tests in §7.

**`targets.ts`**

- BMR via Mifflin-St Jeor:
  - male: `10·kg + 6.25·cm − 5·age + 5`
  - female: `10·kg + 6.25·cm − 5·age − 161`
- Activity multiplier from `sessionsPerWeek`: 0 → 1.2, 1–2 → 1.375,
  3–4 → 1.55, 5–6 → 1.725, 7+ → 1.9
- Goal adjustment: cut −15%, maintain 0, bulk +10%
- Protein target in g/kg by goal (cut 2.2, maintain 1.8, bulk 2.0), overridable,
  displayed in both g/kg and g/lb
- Micronutrient targets from `RNI_MY` and `DV_US`, **both shown**:
  `Potassium 2,560mg · 73% RNI · 54% DV`

Calories and protein are personal, computed from the profile. Only the
micronutrients need published reference tables, because no formula turns height
and weight into a potassium requirement.

**`cost.ts`** — cost per portion, cost per kg raw, cost per kg cooked, and
protein per MYR (`total protein g ÷ price paid`), which is the headline number
for comparing what to buy.

**`methodCompare.ts`** — ranks every method available for an ingredient by
retained weight and retained nutrients, computed from the yield and retention
tables rather than authored:

```
Kangkung, 500g raw — method comparison

Steamed     92% weight kept  ·  94% potassium  ·  91% magnesium   ← best
Stir-fried  78%              ·  90%            ·  88%
Boiled      88%              ·  71%            ·  74%
```

Once the user has logged cooks, their own measured yields replace the published
ones here, so the advice stops being generic and becomes their kitchen's.

---

## 5. Screens

Four tabs. `Today` is the landing tab by default; `Settings.landingTab` can
change it to `Calc`. The two were close enough in review that the choice is
better made after real use than in advance.

**Today** *(default)* — calorie and protein progress against the day's targets,
meals listed with their entries, add-a-meal and quick-add. The habit screen.

**Kitchen** — batches grouped by derived state. Raw batches offer *mark as
cooked*; cooked sessions offer *eat a portion* and show portions remaining.
Single-session batches render flat.

**Calc** — ingredient, weight, unit, raw-or-cooked, method. Returns cooked
weight with its working, nutrient totals with both percentages, the method
comparison, and a *log this as a batch* action. Stateless until that action.

**Costs** — purchase table sorted by any column, protein per MYR, totals by
location and by period, CSV export, JSON backup and restore.

**Profile / Settings** — reached from the header, including profile switching.

---

## 6. Error handling and edge cases

**Cooked weight above raw is not always an error.** Rice, pasta and dried
legumes absorb water and legitimately multiply in weight. The sanity check is
direction-aware per ingredient via `absorbsWater`; a blanket "cooked must be
less than raw" rule would fight the user every time they cook rice.

**Profile edits must not rewrite history.** If the user's weight drops 3kg,
their TDEE changes — but last Tuesday's "78% of target" must still mean what it
meant last Tuesday. `DayLog` snapshots that day's targets when its first entry
is written. Without this, the entire history silently re-reads itself on every
weight update.

The remainder:

| Case | Behaviour |
|---|---|
| Ingredient not in dataset | Opens the add-your-own form; never a dead end |
| No yield factor for ingredient + method | Falls back to category default, labelled *rough estimate* |
| No retention factor | Assumes 100% retention and says so |
| Outlier cook session | Flagged in the UI, kept, and excludable with one tap |
| Ingredient referenced by batches | Archived, not deleted |
| Eating more than `cookedRemainingG` | Blocked, with the remaining weight and portion count shown |
| Cooking more than `rawRemainingG` | Blocked, with the remainder shown |
| IndexedDB unavailable (private browsing) | Detected at launch and announced, rather than silently discarding entries |
| Schema change | Dexie versioned migration; data is never dropped |

**Local-only storage means losing the device loses the data.** The JSON
backup/restore in Phase 4 is what makes local-only defensible, not a convenience.

---

## 7. Testing

The calculation core is pure, which is what makes it properly testable. Built
test-first.

**Golden-value tests — the most valuable suite.** For roughly 20 ingredients
where USDA publishes both raw and cooked entries, derive the cooked values from
raw + yield + retention and assert they fall within tolerance of USDA's actual
cooked figures. This turns the chicken-breast check into a regression net: if a
factor is wrong or a conversion inverts, it fails loudly and specifically.

Alongside it:

- Unit round-trips (g ↔ kg, raw ↔ cooked) as property tests
- BMR and TDEE against published worked examples
- Yield resolution: precedence order, mean calculation, exclusion handling,
  correct fallback when no sessions exist
- Lifecycle invariants: portions remaining never negative, `rawRemainingG` never
  negative, derived batch state correct at every transition
- Cost arithmetic, including partial-batch apportioning
- CSV escaping (ingredient names and locations containing commas or quotes)

---

## 8. Phasing

Four slices, each usable on its own.

| Phase | Deliverable | Standalone value |
|---|---|---|
| **1** | Ingredient dataset, calculator, yield + nutrient engine, method comparison, profile & TDEE | A working calculator |
| **2** | Batches, cook sessions, portions, Kitchen screen, yield calibration, price capture | Adds the tracker |
| **3** | Today screen, meals, quick-add, daily targets, DayLog snapshots | Closes the calorie loop |
| **4** | Costs tab, protein per MYR, CSV export, JSON backup/restore | The analysis layer |

Price, location and date are **captured from Phase 2**, the moment batches
exist. Phase 4 is only the reporting view over data already being collected, so
nothing is lost by its position.

---

## 9. Open risks and assumptions

These are known unknowns to resolve during Phase 1, not blockers.

1. **Retention factor availability.** USDA's Table of Nutrient Retention
   Factors, Release 6 is the intended source. If it cannot be extracted in bulk,
   the fallback is a coarser hand-encoded table keyed by nutrient class rather
   than individual nutrient, documented as such in the UI.

2. **RNI Malaysia encoding.** Roughly 50–60 figures, hand-encoded from the 2017
   publication and verified against it. The iron recommendation is stated at
   several dietary bioavailability levels; one level will be chosen and labelled
   explicitly rather than presented as *the* figure.

3. **Local ingredient coverage.** USDA will not have some Malaysian staples.
   Phase 1 ships roughly 60 ingredients covering common regulars and grows from
   there; the add-your-own flow is the designed answer for the gap, which is why
   it is Phase 1 rather than later.

4. **Curation effort is real.** Assembling and verifying ~200 ingredients is
   genuine work, not a scripted import, because FDC entries need selecting and
   de-duplicating by hand.

5. **Accuracy ceiling.** Published yields describe a reference kitchen, not
   yours. The calibration loop is the mitigation, and the UI is explicit about
   whether a number is measured, published or a category fallback — the app
   should never display precision it does not have.
