# IngCalc Phase 2 — Kitchen, Batches and Calibration

**Date:** 2026-09-19
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md`

---

## 1. What this document is

An addendum, not a replacement. The parent spec already defines Phase 2's data
model (§3), its screen (§5), its lifecycle edge cases (§6) and its place in the
phasing (§8). This records only what Phase 2 had left open, the decisions taken,
and the two places where implementation departs from the parent spec's literal
interfaces.

Phase 2's deliverable, restated from §8: *batches, cook sessions, portions,
Kitchen screen, yield calibration, price capture* — "adds the tracker".

The calibration loop is the real prize. Phase 1 shipped `resolveYield` with a
`measured` branch that nothing could reach, because nothing produced yield
samples. Phase 2 is what makes the app's numbers become the user's own.

---

## 2. Decisions taken

### 2.1 Cost arithmetic: capture, plus per-batch figures

Phase 2 captures price, location and date, and ships `core/cost.ts` so a batch
can answer *was that a good buy?* on its own card. Phase 4 then adds only the
cross-batch view: the sortable table, totals by location and period, and CSV.

The alternative — capture the data and display nothing derived until Phase 4 —
would leave price data inert for a whole phase while the module needed to read
it is a small pure function with no UI cost beyond a line on a card.

### 2.2 Eating a portion: decrement only

Kitchen's *eat a portion* decrements `cookedRemainingG` and writes no other
record. Meals and `MealEntry` arrive in Phase 3 as the designed answer to
*where did the food go*, and the parent spec deliberately has no
consumption table for Phase 2 to build.

The accepted cost: consumption recorded before Phase 3 exists is invisible to
Phase 3's Today screen. This is acceptable because Phase 2's own question is
how much is left, not what was eaten.

### 2.3 Corrections: editing, plus guarded delete

The parent spec covers blocking impossible entries (§6) but never says how to
fix one already recorded.

| Action | Behaviour |
|---|---|
| Edit a batch's purchase fields | Allowed — price, location and date carry no derived remainder |
| Edit a batch's `rawWeightG` | Allowed down to the total already cooked; below that it is blocked, naming that total |
| Edit a session's method | Allowed freely — method affects calibration, not any remainder |
| Edit a session's `cookedWeightG` | Allowed; `cookedRemainingG` is rescaled to preserve the fraction already eaten (see below) |
| Edit a session's `rawUsedG` | Allowed only while it does not exceed the batch's raw remainder excluding this session |
| Delete a session | Allowed; returns its raw to the batch's derived remainder |
| Delete a batch | Allowed, cascading its sessions, behind a confirmation that names how many sessions and how much cooked food will go with it |

Rescaling a corrected cooked weight preserves the fraction eaten rather than
the grams eaten, because the grams were always a reading of the same food:

```
cookedRemainingG' = clamp(cookedWeightG' × (cookedRemainingG / cookedWeightG), 0, cookedWeightG')
```

Weighing 800g as 80g and fixing it later should leave a batch eaten half
through still half remaining, not 720g remaining out of 800g.

Reducing `rawWeightG` below the total already cooked is blocked rather than
clamped: clamping would leave a batch claiming more food came out of it than
went into it, which no later screen could interpret.

Mistyped weights are ordinary, and an uncorrectable wrong cooked weight
permanently poisons the calibration mean for that ingredient and method.
`excludeFromCalibration` mitigates that for calibration alone; it does nothing
about a duplicated batch or a wrong price.

### 2.4 Outlier rule: deviation from the reference figure

Everything is measured against the **reference factor** for that ingredient and
method: its published factor, or the category default when it has none.

```
observed  = cookedWeightG / rawUsedG
reference = ingredient.publishedYield[method] ?? CATEGORY_YIELD[category][method]
```

Two bands, with different consequences:

| Band | Test | Consequence |
|---|---|---|
| **Impossible** | `observed` outside `[reference / 3, reference × 3]` | Blocked at entry; a stored row in this band is flagged `implausible` |
| **Improbable** | within those bounds but more than **±35%** from `reference` | Flagged `deviation`; kept and counted unless excluded |

Flagging is advisory. The session is kept and shown, with one tap to set
`excludeFromCalibration`, exactly as §6 requires. The ±35% band is deliberately
loose: a real kitchen differs from USDA's, and the rule exists to catch a
transposed digit, not to police technique. The ×3 hard bounds catch any
order-of-magnitude slip — 500g entered as 5000g — while admitting every yield
the bundled data itself publishes.

The rejected alternative was deviation from the user's own mean, which is
silent until roughly four cooks of the same ingredient and method exist — and
so misses precisely the early typos it would be most valuable against. The
reference rule works from the first cook.

### Why the bounds come from the reference, not from `absorbsWater`

An earlier draft of this rule blocked cooked weight above raw weight unless the
ingredient had `absorbsWater: true`, which is how the parent spec §6 phrases
its direction-aware sanity check. Checked against the bundled data, that rule
rejects correct cooks:

| Ingredient | `absorbsWater` | Published boiled yield |
|---|---|---|
| Sawi (mustard greens) | `false` | 1.04 |
| Bayam (amaranth leaves) | `false` | 1.04 |
| Cabbage | `false` | 1.07 |
| `CATEGORY_YIELD.vegetable.boiled` | — | 1.05 |

Boiled greens take up water. The rule would have refused a cook that matches
the app's own published figure, and the same draft's ceiling of 3.0 for
absorbing ingredients would have refused boiled rolled oats, published at 6.65,
along with bihun at 3.32.

The deeper problem is that one boolean per ingredient cannot express this:
cabbage *loses* mass steamed and *gains* it boiled. The reference factor is
already per ingredient **and** per method, so bounds derived from it are
direction-aware in a way `absorbsWater` cannot be. This is a stricter reading
of §6's intent, not a departure from it.

`absorbsWater` keeps its documented role — it is what makes a published yield
above 1 expected rather than surprising, and it drives the wording shown to the
user — but it is not the gate. Note also that the bundled data applies it
inconsistently: okra, carrot, pumpkin and sweet potato are marked `true` while
sawi and cabbage are `false`, despite all of them gaining mass when boiled. A
gate resting on that field would inherit the inconsistency.

---

## 3. Departures from the parent spec's interfaces

Both were reviewed and approved. They form one rule: **derive what has an event
log, store what does not.**

### 3.1 `Batch.rawRemainingG` is derived, not stored

§3 lists `rawRemainingG` as a stored field "decremented by each cook session",
while the same section states that batch state is "derived, never stored". Cook
sessions are themselves an event log of raw consumption, so

```
rawRemainingG = rawWeightG − Σ sessions.rawUsedG
```

is always recoverable. Storing it in addition creates two sources of truth that
can disagree, and §2.3's editing and deletion make disagreement likely rather
than theoretical. The field is dropped from the stored row and becomes a pure
function in `core/batch.ts`.

### 3.2 `CookSession.cookedRemainingG` stays stored

The mirror case, and the reason the rule is not "derive everything". Because
eating writes no record (§2.2), there is no event log to derive a cooked
remainder from. It must be authoritative, as §3 says it is.

---

## 4. Storage — schema version 2

`db.version(2)` adds `batches` and `cookSessions`. Version 1's three tables are
unchanged, so no data is rewritten and no migration function is needed; the
Phase 1 plan reserved this shape deliberately.

```ts
interface Batch {
  id: string;
  ingredientId: string;
  rawWeightG: Grams;          // rawRemainingG is derived — see §3.1
  purchase: { pricePaidMYR: MYR; location: string; date: IsoDate };
  createdAt: number;
}

interface CookSession {
  id: string;
  batchId: string;
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;       // measured by the user
  cookedRemainingG: Grams;    // authoritative — see §3.2
  cookedAt: IsoDate;
  portionCount: number;
  excludeFromCalibration: boolean;
}
```

### Feeding calibration

`resolveYield` needs samples keyed by ingredient and method, but a `CookSession`
knows only its `batchId`. Rather than denormalise `ingredientId` onto the
session for an index, the storage layer joins: one `toArray()` of each table,
joined once and memoised in a hook.

A denormalised field would need an invariant test proving it always equals its
batch's `ingredientId`, and one more thing to keep correct through §2.3's edits.
At this app's scale — local-first, a few hundred rows over years of shopping —
the join is cheaper than the duplication. The `[ingredientId+method]` index
remains available later as a purely additive change if measurement ever
justifies it.

### Blocked schema upgrades

Phase 1 logged a deferred defect explicitly against Phase 2: a blocked upgrade
(a second tab holding version 1 open while version 2 loads) does not reject
Dexie's open promise, so `isStorageAvailable()` can hang pending rather than
resolving `false`. It could not arise while only one schema version existed.
Version 2 makes it reachable, so Phase 2 fixes it with `db.on('blocked')` and a
timeout, and the existing launch banner reports it.

---

## 5. Calculation core

Pure, as §4 of the parent spec requires: no storage imports, no React.

**`core/batch.ts`** — derived quantities and the two guards.

```ts
rawRemainingG(batch, sessions): Grams
batchState(batch, sessions): 'raw' | 'partiallyCooked' | 'cooked' | 'finished'
portionWeightG(session): Grams
portionsRemaining(session): number
validateCook(batch, sessions, draft, ingredient): CookValidation
validateEat(session, grams): EatValidation
```

`validateCook` blocks a raw amount above the remainder and rejects an observed
yield outside §2.4's impossible band. `validateEat` blocks eating more than
`cookedRemainingG` and reports the remainder in both grams and portions, since
the user is thinking in whichever the card last showed them.

**`core/calibration.ts`** — mapping onto the `YieldSample` shape Phase 1 left
decoupled for exactly this purpose, and the flag from §2.4:

```ts
toYieldSamples(batches, sessions): YieldSample[]
flagSession(session, ingredient, categoryYield): OutlierFlag | null

interface OutlierFlag {
  kind: 'deviation' | 'implausible';
  observedFactor: number;
  referenceFactor: number;   // absent meaning for 'implausible'
  reason: string;            // shown to the user verbatim
}
```

`flagSession` takes the ingredient and category table rather than the other
sessions: §2.4's rule is deliberately measured against the reference figure,
never against the user's own mean.

**`core/cost.ts`** — `costPerKgRaw`, `costPerKgCooked`, `costPerPortion`, and
protein per MYR in two forms: **raw** (the whole batch, available at purchase,
which is the buying decision) and **retained** (after yield and retention, once
sessions exist). A partially cooked batch apportions its price by
`rawUsedG / rawWeightG`.

---

## 6. Screens

**Kitchen** — batches grouped by derived state, per §5. Raw batches offer *cook
some of this*; sessions offer *eat a portion* or *eat a weighed amount*, and
show portions remaining. A batch with exactly one session renders flat, so the
structure stays invisible in the common case.

Every form reuses what Phase 1 built: `IngredientPicker` for choosing the
ingredient, `WeightInput` for every weight. The cook form defaults `rawUsedG` to
the full remainder so cooking a whole pack is one tap.

A yield badge surfaces `resolveYield`'s `source` and `sampleCount` in the words
§4 of the parent spec specifies — *"your average across 4 cooks: 0.72
(published: 0.75)"* — so the user always knows whose number they are reading.

**Calc** — the three `samples: []` arguments become real data, which is the
moment the calculator and the method comparison stop being generic. Gains the
*log this as a batch* action from §5.

**App shell** — the Kitchen tab is enabled and added to `BUILT`.

---

## 7. Error handling

Additions to the parent spec's §6 table:

| Case | Behaviour |
|---|---|
| Cook draft exceeds raw remaining | Blocked, showing the remainder |
| Eat draft exceeds cooked remaining | Blocked, showing the remainder in grams and portions |
| `portionCount` of zero or below | Rejected; portion weight would be undefined |
| `rawWeightG` edited below the total already cooked | Blocked, naming that total (§2.3) |
| Corrected `cookedWeightG` rescales the remainder | Clamped into `[0, cookedWeightG]`, with the new remainder shown |
| Delete a batch with sessions | Confirmed first, naming the sessions and cooked weight that go with it |
| Session flagged as an outlier | Shown with its reason and a one-tap exclude (§2.4) |
| Cook draft outside the impossible band | Blocked, naming the typical yield for that ingredient and method (§2.4) |
| Blocked version-2 upgrade | Resolves false and reports, rather than hanging (§4) |

---

## 8. Testing

Core first, following Phase 1's convention.

- **Lifecycle invariants** — no remainder ever negative, at every transition:
  cook, partial cook, eat, weighed eat, edit, delete. Derived batch state
  correct at each.
- **Guards** — both validators at their boundaries, against the real bundled
  table rather than fixtures: boiled cabbage gaining mass at 1.07 and boiled
  rolled oats at 6.65 must both be accepted, while a 10× transposed digit must
  be blocked.
- **Portions over grams** — the parent spec's awkward case: a 100g serving from
  a 148g portion, asserting portions remaining follows grams rather than the
  reverse.
- **Outlier rule** — at ±35% exactly, either side (not flagged), just past it
  (flagged `deviation`), and outside the ×3 bounds (flagged `implausible`).
- **Cost** — all four figures, plus apportioning across a partially cooked
  batch, plus a zero-price batch (a gift, or an unrecorded price).
- **Corrections** — a corrected `cookedWeightG` preserves the eaten fraction; a
  `rawWeightG` edit below the cooked total is blocked; deleting a session
  returns its raw to the remainder.
- **Calibration end to end** — sessions written through storage, resolved back
  through `resolveYield`, asserting `source` flips from `published` to
  `measured` and `sampleCount` is right with exclusions applied.
- **Migration** — open version 1, write a profile and a user ingredient, open
  version 2, assert both survive and the new tables exist.

---

## 9. Not in Phase 2

Stated so the boundary is not re-litigated during implementation.

| Excluded | Where it belongs |
|---|---|
| Meals, meal entries, quick-add | Phase 3 |
| Today screen and daily progress | Phase 3 |
| `DayLog` target snapshots | Phase 3 |
| Costs tab, cross-batch totals, CSV export | Phase 4 |
| JSON backup and restore | Phase 4 |
| Any record of what was eaten | Phase 3 (§2.2) |
