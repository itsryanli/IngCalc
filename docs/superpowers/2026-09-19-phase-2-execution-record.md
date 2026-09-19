# IngCalc Phase 2 — Execution Record

Generated during subagent-driven execution of `docs/superpowers/plans/2026-09-19-ingcalc-phase-2.md`.

**Why this file exists:** the plan was wrong in several documented places, and evidence gathered during execution overrode it. This is the record of every ruling made and why, including which plan figures and which plan code were found wrong. **Read it before trusting the plan document for Phase 3.**

Spec: `docs/superpowers/specs/2026-09-19-phase-2-kitchen-design.md` (addendum), over
`docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md` (parent).

Branch: `phase-2-kitchen`, from `main` @ `981ec03`. 27 commits.
Isolation: a feature branch, not a worktree — the same choice Phase 1 made, for the same
reason: the app has to build where the user can run it.

---

## Outcome

| | Baseline @ 981ec03 | Final @ ea7f3be |
|---|---|---|
| Test files | 24 | 38 |
| Tests | 285 | 461 |
| `npm run build` | clean | clean |
| `npm run lint` | exit 0, 1 pre-existing warning | exit 0, same 1 warning |

Golden-value suite unchanged throughout: 94 cases, never touched, never adjusted. That was
the point — this phase changed what feeds `resolveYield`, and the golden tests are the net
that proves the change did not move any USDA-verified figure.

18 tasks. Tasks 1–12 and 14 passed review on the first attempt. Tasks 13, 15, 16 and 17
each took exactly one fix round. None reached a second.

**What the phase actually delivered:** `resolveYield`'s `measured` branch had been
unreachable dead code since Phase 1, because nothing in the app produced yield samples.
Everything here exists to reach it. It is now reached, end to end through real storage,
with the exclusion flag honoured.

---

## 1. The plan was wrong five times

Listed first because it is the most useful thing in this document. In each case the
implementation is right and the plan text is not — if you read the plan for Phase 3, read
these corrections with it.

### 1.1 The outlier rule rejected correct cooks (caught before any code was written)

The approved rule blocked cooked weight above raw weight unless the ingredient had
`absorbsWater: true`, and capped absorbing ingredients at 3.0×. Checked against the bundled
data, both halves reject real cooks:

| Ingredient | `absorbsWater` | Published boiled yield |
|---|---|---|
| Sawi (mustard greens) | `false` | 1.04 |
| Bayam (amaranth leaves) | `false` | 1.04 |
| Cabbage | `false` | 1.07 |
| `CATEGORY_YIELD.vegetable.boiled` | — | 1.05 |
| Rolled oats | `true` | 6.65 |

Boiled greens take up water. The rule would have refused a cook matching the app's own
published figure, and the 3.0 ceiling would have refused boiled rolled oats.

The deeper problem: one boolean per ingredient cannot express this, because cabbage *loses*
mass steamed and *gains* it boiled. Bounds now derive from the **reference factor**, which
is already per ingredient and per method:

- **Impossible** — outside `[reference / 3, reference × 3]` — blocked at entry.
- **Improbable** — inside those bounds but more than ±35% from reference — flagged, kept, counted unless excluded.

`absorbsWater` keeps its documented role (it is what makes a published yield above 1
*expected*) but is not the gate. Note the bundled data applies it inconsistently — okra,
carrot, pumpkin and sweet potato are `true` while sawi and cabbage are `false`, though all
gain mass boiled — so a gate resting on it would inherit that inconsistency.

Two regression tests pin this against the real tables, not fixtures:
`src/core/calibration.test.ts` accepts boiled cabbage at 1.07 and boiled rolled oats at
6.65. **Do not weaken them into fixtures.**

### 1.2 Two of the plan's own tests asserted the opposite of the rule

The plan used a 400g → 200g cook (factor 0.50) as its "unusual but valid" case in three
tasks, asserting a flag reading "50%". Against chicken breast's published roasted factor of
0.71, 0.50 is 29.6% off — *inside* the ±35% band, so `flagYield` returns `null` and all
three tests would have asserted that a flag appears where none does.

Corrected to 400g → 180g (0.45, 36.6% off, flags as `deviation`, still inside the ×3 bounds
so still accepted). If you see 180g/"45%" in a test, it is deliberate.

### 1.3 The plan's per-task test counts were stale

Tasks 1 and 2 stated expected totals that disagreed with their own test code blocks (12
against 14 `it()` blocks; 15 against 16). Reviewers flagged both. The code blocks were
right. Corrected in commit `52b039e`. After the second one I stopped trusting the plan's
counts and verified against the real suite total instead.

### 1.4 A user-reachable dead end in the calculator (Task 16)

The plan's Step 3 snippet produced this ternary in `CalcScreen`:

```
loggingBatch && ingredient !== null ? <AddBatchForm onAddNew={handleAddNew} /> : addingIngredient ? <AddIngredientScreen /> : (…)
```

`AddBatchForm` renders its own `IngredientPicker` wired to the same `handleAddNew`, which
sets `addingIngredient` but never clears `loggingBatch`. So the first branch kept winning,
`AddIngredientScreen` never rendered, and "Add a new ingredient" inside the log-as-batch
flow silently did nothing — breaking the parent spec §6 promise that an unlisted ingredient
"opens the add-your-own form; never a dead end."

Fixed with `setLoggingBatch(false)` in `handleAddNew`. The fuller alternative — a
discriminated `mode` union returning the user to the batch form with the new ingredient
preselected — was declined: the one-liner composes with behaviour the screen already has,
because `handleIngredientAdded` already selects the new ingredient in the calculator and
the batch form takes its `initialIngredientId` from that selection. Cost: one extra tap on
a rare path, instead of a new state machine in the app's largest screen.

### 1.5 The plan's CSS would have been unreadable in dark mode (caught before dispatch)

The plan's Kitchen CSS invented token names that do not exist in `src/index.css` —
`--space-4`, `--color-text-muted`, `--color-warn-surface` and others — each with a
hard-coded light-mode hex fallback. `src/index.css:64` has a
`@media (prefers-color-scheme: dark)` block redefining the project's real tokens, so those
fallbacks would always resolve: the Kitchen screens would look correct in light mode and
render a light `#fef3c7` panel with dark text in dark mode. Valid CSS, no test could catch it.

Replaced with the real tokens: `--sp-2/3/4`, `--fs-xs/sm`, `--radius`, `--border`,
`--surface-sunken`, `--text-dim`, `--danger`/`--danger-soft`, and `--estimate`/`--estimate-soft`
— the design system's existing semantic for "a rough estimate", which is exactly what a
deviation flag and a category-default yield factor are.

---

## 2. The build was broken for three tasks, and that is a process failure

`npm run build` runs `tsc -b`. `vitest` does not typecheck. Between Task 14 and Task 17
nothing ran the build, so this sat on the branch:

```
src/ui/components/BatchCard.tsx(75,42): error TS2345: Argument of type 'number' is not assignable to parameter of type 'Grams'.
src/ui/components/BatchCard.tsx(130,41): error TS2345: ...
```

`cookedLeft` came from a bare `mine.reduce(...)`, returning a plain `number`, passed to
`formatG(v: Grams)`. It passed every test, passed its own task review, and survived two
further tasks. Fixed by branding at the point of production —
`const cookedLeft = g(mine.reduce(...))` — not by casting, because `g()` also validates
finite and non-negative.

**Why it happened:** the controller verified each task with `npm test` but ran
`npm run build` at only two of seventeen tasks, despite the plan's own Global Constraints
requiring the build to stay clean. Reviewers read diffs; they do not compile them. Nothing
in the suite could ever have caught it.

**For Phase 3: run `npm test`, `npm run build` and `npm run lint` after every task.** Two
of those three catch things the others cannot.

This is also Task 1's deferred "minor" coming true almost verbatim. That review noted the
bare-reduce pattern in `core/batch.ts` was safe *there* because it fed only a threshold
comparison, but warned it "should not be copy-pasted into anything that RETURNS Grams." It
was, into `BatchCard`, where it feeds a formatter. Deferred minors are not always cosmetic.

---

## 3. Design decisions and departures, with reasoning

### 3.1 Derive what has an event log, store what does not

`Batch` has **no** `rawRemainingG` field, though the parent spec §3 lists one. Cook
sessions are an event log of raw consumption, so the remainder is always recoverable —
storing it too would be a second source of truth that editing could put out of step.
`CookSession.cookedRemainingG` **is** stored, because eating writes no record until Phase 3,
so there is no log to derive it from. The asymmetry is the whole rule.

**Phase 3 note:** once meals exist, `cookedRemainingG` becomes derivable. Whether to
convert it is a real decision, not an obvious one — the stored value is authoritative today
and a migration would have to reconcile pre-Phase-3 eating, which was never recorded.

### 3.2 Eating writes no record in Phase 2

`EatControl` decrements `cookedRemainingG` and nothing else, per the addendum §2.2.
Consumption before Phase 3 is therefore invisible to Phase 3's Today screen. Accepted: the
question this phase answers is "how much is left", not "what did I eat".

### 3.3 Calibration joins rather than denormalising

A `CookSession` knows only its `batchId`; the batch knows the `ingredientId`.
`toYieldSamples` joins them. The alternative — denormalising `ingredientId` onto every
session for an index — would need an invariant test proving the two never disagree, and one
more thing to keep correct through edits. At this scale the join is cheaper than the
duplication. The `[ingredientId+method]` index remains available as a purely additive
change if measurement ever justifies it.

`cookSessions` is indexed by `batchId` for the cascading delete, which exists because an
orphaned session is silently skipped by `toYieldSamples` — the cook would vanish from
calibration while still occupying a row.

### 3.4 Storage writes are wrapped everywhere (a ruling, not in the plan)

The plan's UI components called storage with no error handling, while Phase 1's own
`AddIngredientScreen.tsx:55-64` wraps its save and surfaces a message. On a Dexie rejection
— private browsing, quota exhausted, a blocked upgrade mid-session — an unwrapped write
becomes an unhandled promise rejection, the success callback never fires, and the user taps
Save to nothing. The launch-time storage probe does not cover mid-session failures.

Every Phase 2 write is now wrapped, surfaces through `role="alert"`, and **does not invoke
its success callback on a failed write** — screens treat that callback as proof the row
exists and refresh from storage on the strength of it. Task 10's implementer raised this
itself as `DONE_WITH_CONCERNS`; it was right.

### 3.5 Confirmation prompts are not `role="alert"`

Task 13 shipped a real bug worth remembering. `SessionRow` made its delete-confirmation
prompt `role="alert"`, which collided with the write-error alert, so the error was
suppressed while the prompt was open — silently swallowing a legitimate failed write on the
exclude-toggle path. It also let a stale error resurface when the dialog was reopened and
cancelled.

The resolution, now used by both `SessionRow` and `BatchCard`: the confirmation prompt is a
plain `<p>`; the write error is the **only** `role="alert"` and renders unconditionally;
both confirm transitions clear the error. A question the user just triggered, sitting beside
its own buttons, is not an assertive live region. One plan-written test was re-queried from
`getByRole('alert')` to `getByText(...)` to suit — its assertions were preserved exactly.

**Follow this shape for any new confirm-plus-error component in Phase 3.**

### 3.6 A newly added ingredient wins over the batch being edited

`AddBatchForm` initialises `ingredientId` as
`initialIngredientId ?? batch?.ingredientId ?? ''`. The precedence matters: the only reason
to create a brand-new ingredient while editing a batch is to change that batch to it, so
letting the original win discards exactly the intent just expressed. Safe because
`initialIngredientId` has only two callers — `KitchenScreen`'s post-create return, and the
calculator's hand-off, which never passes `batch`.

### 3.7 Zero price is not "not computable"

Cost functions return `null` for "not computable", but a **zero price is not one of those
cases for every figure**. A 1000g gift at RM0 gives `costPerKgRaw` = 0 — rendered
"RM0.00/kg raw", which is true and useful — while `proteinPerMYRRaw` returns `null`,
because protein per ringgit is genuinely undefined when dividing by zero ringgit. The
addendum's blanket "a zero price → null" was loose phrasing; the implementation
distinguishes correctly.

### 3.8 `proteinPerMYRRetained` never applies a yield factor

Cooking moves water, not protein: the measured `cookedWeightG` changes the concentration,
not the mass. Only retention removes protein, so only `retentionFor(...)` is applied. This
respects the user's own measured weights instead of re-deriving them from a published
factor. **Do not "fix" this by routing it through `computeCooked`.**

### 3.9 Dates are built from local parts

`todayIso` uses `getFullYear`/`getMonth`/`getDate`, never `toISOString()`, which is UTC —
in Malaysia that files a batch bought before 8am to the previous day. `formatIsoDate` parses
and rebuilds locally, because `new Date('2026-09-19')` is UTC midnight and formats as the
18th in any negative offset. Both are pinned by tests.

### 3.10 Blocked schema upgrades

Phase 1 logged this defect explicitly against Phase 2: a blocked upgrade (a second tab
holding v1 open while v2 loads) does not reject Dexie's open promise, so
`isStorageAvailable()` could hang pending and the launch banner would never warn the user
their entries were being discarded. Fixed by racing the open against `db.on('blocked')` and
a timeout, with both torn down in a `finally`. `timeoutMs` is injectable so the hang is
testable in milliseconds.

The `blocked` event pathway itself is not exercised behaviourally — firing Dexie's internal
event would test Dexie's plumbing, not ours, and the observable outcome (the probe resolves
`false`, so the banner renders) is covered by the never-settles test. A regression removing
the subscription would degrade to waiting out the 3s timeout rather than breaking.

---

## 4. Known gaps, carried forward

Nothing here blocks the phase. Each was judged and deferred deliberately.

| Gap | Where | Why deferred |
|---|---|---|
| No test covers `excludeFromCalibration` surviving an edit when the flag is `true` | `CookSessionForm` | Code correct by inspection; this is the invariant with the nastiest silent failure mode (a refactor could pull an excluded bad reading back into the yield average). **Highest-value test to add.** |
| No test pins the cook guard's exact `remaining + EPSILON` boundary | `core/batch.ts` | The eat path covers its equivalent. EPSILON is load-bearing for real float input. |
| `costPerPortion` returning `null` is verified by reading, not rendering | `SessionRow` | "Must render as nothing rather than RM0.00" has no positive test. |
| Cross-batch isolation test asserts only the rendered session count | `BatchCard` | Not that remaining weight and cost are unaffected by a foreign session. Correct today because every consumer shares `sessionsOf`. |
| The cost line concatenates four separator-carrying fragments | `BatchCard` | Safe only because `rawWeightG > 0` is enforced upstream, which guarantees the first fragment anchors the string. Wants a guard if `cost.ts` invariants loosen. |
| `storageError` clearing after a successful refresh is untested | `useKitchen` | Verified by inspection. `useCatalogue` has the same gap for its analogous property. |
| A failed write's real error is discarded | every wrapped write | Quota vs corrupt-DB vs private-mode are indistinguishable when debugging a support report. Matches Phase 1 precedent. |
| Add-ingredient round trip loses typed weight/price/location | `KitchenScreen` | The form unmounts. Preserving them means lifting its state into the screen. The new ingredient *is* preselected, which covers the worst of it. |
| `formatIsoDate('2026-13-45')` returns "14 Feb 2027" | `ui/dates.ts` | `Date` rollover rather than rejection. Unreachable from the UI, where every value comes from `<input type="date">`. |
| Duplicated cost filtering | `cost.ts` | `costPerKgCooked` and `proteinPerMYRRetained` each call `attributablePriceMYR` (which runs `sessionsOf`) then call `sessionsOf` again. |
| `CalcScreen.tsx` is 226 lines with three responsibilities | `CalcScreen` | Calculation, add-ingredient flow, batch-logging flow. The batch-logging unit is extractable if Phase 3/4 add more here. |

---

## 5. What was NOT verified

**The phone-width visual pass.** The plan's Task 18 Step 5 asks for a manual walkthrough at
390px in a real browser — checking one-thumb reach, no horizontal scroll, and a two-cook
batch card still reading cleanly. A subagent cannot do this meaningfully and it was not
done. The behaviour it would confirm is covered by tests; the *appearance* is not.

Someone should run `npm run dev`, open the Kitchen tab at phone width, and walk the
lifecycle: log a 1kg chicken-breast purchase at RM20, cook 400g roasted to 284g in 4
portions, eat one portion then a weighed 50g, open Calc and confirm the trace reads "your
average across 1 cook", tick *ignore this cook* and confirm it reverts to the published
factor, then delete the batch and confirm the confirmation names what goes with it.

**Dark mode was verified by token, not by eye.** Every token used is defined in `:root` and
redefined in the dark-mode block, which is why the earlier fallback bug mattered — but
nobody looked at it in dark mode.

---

## 6. Phase 3 starts here

Phase 3 is the Today screen: meals, quick-add, daily targets and `DayLog` snapshots.

What this phase leaves it:
- `resolveYield` calibrated from real cook sessions — nutrient figures now reflect the user's kitchen.
- Schema v2. Phase 3 adds `meals` and `dayLogs` as v3; Dexie's `stores()` is a delta, so v1 and v2 tables stay declared and untouched. `migration.test.ts` shows the pattern, and builds its throwaway databases from `SCHEMA_V1`/`SCHEMA_V2` exported from `db.ts` so the test cannot drift from the real schema. Export `SCHEMA_V3` the same way.
- `CookSession.cookedRemainingG` as the quantity meals decrement. See §3.1 before changing it.
- The `landingTab` setting still typed `'today' | 'calc'`. Widen it when Today exists and the choice is real.
- The confirm-plus-error component shape from §3.5.
