# IngCalc Phase 3 — Execution Record

Generated during subagent-driven execution of `docs/superpowers/plans/2026-09-19-ingcalc-phase-3.md`.

**Why this file exists:** the plan was wrong in a dozen documented places and the reviews
found a class of defect the test suite could not. This is the record of every ruling made
and why, including which plan text was found wrong. **Read it before trusting the plan
document for Phase 4.**

Spec: `docs/superpowers/specs/2026-09-19-phase-3-log-design.md` (addendum), over
`docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md` (parent).

Branch: `phase-3-today`, from `main` @ `30a6ab8`. 28 commits.
Isolation: a feature branch, not a worktree — the same choice Phases 1 and 2 made, for the
same reason: the app has to build where the user can run it.

---

## Outcome

| | Baseline @ 30a6ab8 | Final @ f99e98f |
|---|---|---|
| Test files | 40 | 51 |
| Tests | 513 | 637 |
| `npm run build` | clean | clean |
| `npm run lint` | exit 0, 1 pre-existing warning | exit 0, same 1 warning |

Golden-value suite unchanged throughout: 94 cases, never touched, never adjusted.
`git diff main -- src/core/golden.test.ts` is empty. That was the point — this phase
re-weights existing nutrient arithmetic rather than adding any, so those cases passing
unmodified is the evidence no published figure moved.

18 tasks, executed as 13 dispatches (five pairs were batched as same-shape work). Six
tasks needed exactly one fix round. None reached a second. The final whole-branch review
found one merge-blocking bug; one fix wave closed it.

**What the phase actually delivered:** `CookSession.cookedRemainingG` was a stored field.
It is now derived from meal entries, which means deleting a meal restores the remainder
with no compensating write, editing one is arithmetic rather than reconciliation, and the
two numbers can no longer drift because there is only one. Everything else — the Log
screen, the fourth entry kind, the responsibility split — exists to make that possible or
to use it.

---

## 1. The plan was wrong, repeatedly

Listed first because Phase 2's record put it first and was right to. In each case the
implementation is correct and the plan text is not.

### 1.1 Task 1 would have ended with a broken build (caught by the implementer)

My pre-flight scan ruled that Task 1 must widen `App.tsx`'s `Tab` union and change an
`App.test.tsx` fixture. Both halves of that ruling were wrong in detail:

- I said to drop `'today'` from the union. `TABS` still carried a disabled Today
  placeholder, so removing the member fails to typecheck that literal.
- I said to set the fixture to `'kitchen'`. That line sits inside the test *"falls back to
  Calc when the stored landing tab is not built yet"*, and Kitchen **is** built, so the app
  navigates there and the assertion fails. My stated rationale described a different test.

The implementer caught both, used `'log'` (the only value the widened type can hold that
is not in `BUILT`), and was confirmed correct by review. **The lesson: I wrote a ruling
against a line number without reading the name of the test that line belonged to.**

### 1.2 The cooked-weight guard is harder than the spec said

Spec §7 says an edit below what has been eaten is "blocked, naming the grams already
eaten". Planning found that insufficient, because a `portion` entry's grams are a *share*
of the cooked weight and portion count, while a `weight` entry's are absolute. So the guard
must be evaluated at the **draft's** values, not the session's. A guard reading current
values gets two real cases backwards:

- Shrinking a cook eaten only in portions is wrongly refused — two of four portions is half
  the pan at any weight.
- Recutting 4 portions to 2 when three are eaten is wrongly allowed — those three become
  1.5 pans.

`consumedFromSessionAt(session, entries, cookedWeightG, portionCount)` takes both as
parameters for this reason. Its redundant-looking signature is load-bearing. Both cases are
pinned in `batch.test.ts` and a reviewer confirmed each fails under the naive
implementation.

### 1.3 The module boundary in spec §5 is a circular import

Spec §5 lists `consumedFromSession`, `cookedRemainingG`, `portionsRemaining` and
`entryGrams` under `core/meals.ts`. They are in `core/batch.ts` instead. `cookedRemainingG`
needs `entryGrams` needs `portionWeightG` (in `batch.ts`), while `batchState` (in
`batch.ts`) needs `cookedRemainingG`. The split is now **`batch.ts` owns grams, `meals.ts`
owns nutrition**; `meals.ts` imports `batch.ts` and never the reverse.

### 1.4 Four CSS names in the plan did not exist

`flag--estimate` (the base `.flag` is *already* the amber estimate treatment;
`.flag--implausible` is the red override), `seg__btn--on` (selection is styled off
`[aria-pressed='true']`), and two rules using `--border` as a border shorthand when it is a
colour-only token, so the border would render nothing. The plan's own self-review caught
the first two before dispatch; Task 17's implementer caught the third.

### 1.5 Smaller plan errors, all caught by implementers

- Task 4's `snapshotTargets` test referenced fixtures that do not exist in the real
  `targets.test.ts`.
- Task 6's file list omitted five files the compiler flagged, and its `CookSessionForm`
  snippet would have **regressed `validateRawUsedEdit`** by replacing a branching
  validation with an unconditional one.
- Task 8's `ErrorBoundary` snippet does not compile under this repo's `noImplicitOverride`.
- Task 13's snippet had a missing import and two unused ones, and its own test suite failed
  against its own component (an `aria-label` of "How much" on a `role="group"` collided
  with `getByLabelText(/how much/i)` for the input inside it).
- Task 15's snippet omitted the `key` the component's contract requires, and exported
  `labelForHour`, which trips `react(only-export-components)`.

---

## 2. Correct code with no guard — the defect class of this phase

Phase 2's record opens with a type error that survived three tasks because nothing
compiled the diff. Phase 3's equivalent is subtler and worth naming, because the suite was
green throughout and the code was right every time.

Reviewers began **mutation-testing**: deliberately breaking the implementation to see
whether anything went red. It kept finding nothing did.

| Mutation | Tests still green |
|---|---|
| Delete `useLog`'s entire generation counter and all four guards | all 6 |
| Gate `AddEntryForm`'s live preview to one of its three sources | all 11 |
| Replace `AddEntryForm`'s `others` list with `allEntries` | all 11 |
| Pass `null` as `validateEntry`'s `editingId` | all 11 |
| Swap `LogScreen`'s `allEntries={kitchen.entries}` for `log.entries` | all 11 |
| Swap `LogScreen`'s `date={date}` for `todayIso(today)` | all 11 |
| Delete `kitchen.refresh()` from `LogScreen`'s save handler | all 11 |

Every one of those is a real user-facing bug if it ever regressed, and three of them are on
the app's landing screen. The tests were named after the behaviours and did not exercise
them. In two cases the test passed for a *different reason* than its name claimed — most
insidiously, `validateEntry` re-filters by `editingId` internally, which made the
component's own exclusion redundant *for that call* and masked that the exclusion which
actually matters, in the available-cooks list, had no coverage at all.

**For Phase 4: a review that only reads the diff will not find this.** Ask reviewers to
mutate. When a fix adds a test, require falsification evidence — break it, watch it go red,
restore it, watch it go green — and have the re-reviewer reproduce that rather than accept
it. Three re-reviews in this phase did reproduce it; each time the evidence held.

One implementer falsified its own regression test and reported that it did not fail when
the `key` was removed, with the correct explanation. That left a comment in the test file
asserting the opposite, which became the one Important finding of that round: **the code
advertised a guard it did not have.** A false assurance in a comment is worse than no
comment, because it is what gets the "redundant" prop deleted later.

---

## 3. The bug no per-task review could see

The final whole-branch review found it, and it was the only thing that blocked merge.

**Deleting a profile orphaned its meal entries, and they went on consuming the kitchen
forever.** `deleteProfile` was `db.profiles.delete(id)` — correct before Phase 3, when
nothing referred to a profile. Phase 3 added `profileId` to `mealEntries` and `dayLogs`.

Eat two portions of a 284g cook, delete that profile, and the cook reads **142g left**
permanently: `loadKitchen` reads every entry unfiltered and `cookedRemainingG` filters only
on `cookSessionId`, while the only route back to those entries — `loadDay`'s
`[profileId+date]` query — belongs to a profile that no longer exists. Unreachable by every
delete path, invisible on every Log day.

Worse, `ProfileCard`'s confirmation read *"Nothing else refers to a profile, so this
removes only the targets other screens measure food against."* True when written. Phase 3
made it false, and the app was using it to tell the user the delete was safe.

This is exactly the orphan class spec §4 made the batch and session cascades mandatory for,
reached through the one entity no task in the phase opened. **Eighteen task reviews could
not see it because eighteen task briefs never mentioned that file.** That is the argument
for the whole-branch review existing, stated as concretely as this phase can state it.

---

## 4. Design rulings and departures

### 4.1 Correcting a cook no longer rescales what was eaten

Phase 2's `rescaleCookedRemaining` preserved the *fraction* eaten: weighing 800g as 80g,
eating 40g, then correcting to 800g left 400g. Now the same sequence leaves 760g.

A `weight` entry records grams someone put on a scale; that reading does not change because
the pan was re-measured. A `portion` entry records a share of the pan, and still rescales.
Phase 2's unconditional rule was correct only because a stored scalar could not tell the
two apart; with an event log it has to. The guard against driving the remainder negative
moved from the field to the edit (§1.2).

### 4.2 `Meal` is not a table

Spec §3.1. A `Meal` row would hold `id`, `profileId`, `date`, `label` and nothing else —
created before a day's first entry of that label, deleted after the last, introducing an
orphan class for no gain. A meal is a grouping of entries computed on read. The derivation
also needs a flat table indexed by `cookSessionId`; with entries nested in meals, summing a
session's consumption means loading every meal ever written.

### 4.3 A portion's nutrients never pass through a yield factor

`sessionRetainedNutrients` = raw nutrients for `rawUsedG` × per-nutrient retention. The
measured `cookedWeightG` is the *denominator* in `entryNutrients`, never a factor on the
mass. Cooking moves water, not nutrients. Same rule as `proteinPerMYRRetained`, Phase 2
§3.8. **Do not "fix" this by routing it through `computeCooked`.** `ingredient`-kind
entries are the one case with no measured weight, so they do use the calculator's path —
that is not a contradiction.

A reviewer hand-checked the arithmetic end to end: 400g raw chicken at 22.5g/100g = 90g
protein, × 0.98 retention = 88.2g in a 284g cook, so one of four portions is 22.05g. The
browser pass later showed **22.1g on screen**. The engine survives the whole stack.

### 4.4 Three degradations, not one flag

`dayTotals` returns `unknownMicroEntries` and `unknownProteinEntries` separately. A `quick`
entry always carries calories, usually carries protein, never carries micronutrients. One
"incomplete" flag would put an "at least" on a figure that is exact.

### 4.5 A `DayLog` outlives its last entry

`deleteEntry` deliberately leaves the day log behind. Spec §7's table says a day with no
entries has no `DayLog`; the implementation is better and the spec line should be read as
"a day never logged". Deleting it would let a re-added entry resnapshot against today's
targets — the history rewrite the table exists to prevent.

### 4.6 Calc writes nothing

The parent spec's *log this as a batch* is gone. The diagnosis, raised by the user during
design: Calc holds an ingredient picker, a weight input, a raw/cooked toggle and a live
nutrient readout, and so does Log's any-ingredient form — the hand-off would have bridged
two instances of the same thing. Giving Log's form its own readout removed the reason to
start in Calc when the intention is to record. It also took `CalcScreen` from three
responsibilities to one and deleted the bug class behind Phase 2 §1.4.

---

## 5. Known gaps, carried forward

Nothing here blocks the phase. Each was judged and deferred deliberately; the final review
triaged all 22 and cleared these to ship.

| Gap | Where | Why deferred |
|---|---|---|
| `AddEntryForm` seeds fields from once-only `useState` initialisers while reading `id`/`createdAt` from the live prop | `AddEntryForm` | **The most load-bearing item here.** Reuse the element across entries and it writes the previous draft under the new id, silently. Mitigated by a documented contract, `key={editing?.id ?? 'new'}` at the call site, and a rerender test. The right fix is the idiom `useLog` already uses — `prevKey` in state, adjusted during render. Two tasks solved the same problem two ways; only one is safe against its next caller. |
| `validateCookEdit` throws `RangeError` where `validateCook` returns a failure | `core/batch.ts` | Unreachable: `CookSessionForm` runs `validateCook` first on every edit path. Type-honesty nit. |
| Persisted `cookSessions` rows still carry the stale `cookedRemainingG` key | IndexedDB | Never indexed, never read, any `put` overwrites it, and the database was empty. **Do not write a migration for it.** |
| `settings.activeProfileId` can dangle after deleting the active profile | `storage/profiles.ts` | Pre-existing; `resolveActive` falls back to `profiles[0] ?? null`. Widening the transaction to `settings` buys nothing the UI does not absorb. |
| `db.dayLogs.filter(...)` in the cascade is a full scan | `storage/profiles.ts` | One row per profile-day. Wants a `profileId` index only if that table grows. |
| The `true, true` inclusive-bound flags on the cascade's key range are inert | `storage/profiles.ts` | No real date key equals `Dexie.minKey`/`maxKey`. Correct either way; the comment oversells them. |
| `LogScreen` never consults `log.loading` or `kitchen.loading` | `LogScreen` | `useLog.loading` is returned, tested, and consumed by nobody. During a kitchen load or storage error, kitchen-sourced entries read 0 with no `--estimate` treatment. A banner does render, so it is not silent. `KitchenScreen` gates its empty state on `!loading`; Log does not. **The error-handling inconsistency across the new screens.** |
| `describeEntry`'s dead-session message is unreachable for its stated cause | `ui/labels.ts` | Cascades mean no surviving entry has a dead session. The branch fires when `ctx.sessions` is empty — during load or a storage error — where "the kitchen could not be read" is the honest message. |
| Row-level Edit/Delete buttons have no per-row accessible name | `EntryRow`, `SessionRow`, `ProfileCard` | A screen-reader user hears the same pair N times. Phase 3 broke nothing — it multiplied an existing pattern onto the screen the user now opens daily. |
| Validation errors persist while the user corrects the field | `AddEntryForm` | House pattern across `CookSessionForm`, `AddBatchForm`, `ProfileForm`. Changing it here alone would be the inconsistency. |
| Vitest's 10s hook timeout flakes under CPU contention | test config | Three `db.open()` hooks timed out during a review run made while build and lint ran concurrently; 637/637 in 17s uncontended. Not a defect, but it will bite on a loaded CI runner. Raise `hookTimeout` before this lands anywhere parallel. |
| Entry rows are tall — Edit and Delete each take a full row below 480px | `EntryRow` | The app's existing phone behaviour (`.btn-row .btn { width: auto }` applies only at ≥30rem). Predates the phase. |
| Assorted test-hygiene items | various | A tautological assertion in `CookSessionForm.test.tsx`; an unreached fixture in `batch.test.ts`; a forward-guard query for a button that does not exist; substring rather than exact assertions; `console.error` spied without being asserted; `describeAvailable` and `labelForHour` thinly covered. |

---

## 6. What was verified, and how

**The phone-width visual pass was done.** Phase 2's record states plainly that its
equivalent was not; this one was, and it is worth recording how so Phase 4 can repeat it.

`playwright-core` was installed **into the session scratchpad, not the project** —
`package.json` is untouched — and driven against the installed Chrome at 390×844,
`deviceScaleFactor: 2`, in both colour schemes. The full lifecycle ran against real
IndexedDB: first run → create a profile → log a 1kg chicken purchase → cook 400g roasted
into 284g across 4 portions → log one portion from the Log → quick-add a teh tarik → step
back to yesterday. Fourteen screenshots per scheme, with a horizontal-overflow measurement
at every step.

What that proved which no unit test could:

- Kitchen reads **284g left · 4.0 portions** after the cook and **213g left · 3.0
  portions** after one portion is eaten in the Log. The derivation works end to end,
  through real storage, across two screens, with no stored remainder.
- The eat control is genuinely gone from Kitchen (query count 0).
- One portion reports **22.1g protein on screen** — the figure `meals.test.ts` asserts.
- Zero page errors, zero console errors and zero horizontal overflow at 390px at every
  step in both schemes.
- **Dark mode is correct by eye, not just by token.** The amber estimate treatment renders
  on both the micronutrient floor panel and the "at least 22g" protein line. The
  light-panel-with-dark-text failure Phase 2 §1.5 warned about did not happen.

It also found a defect no test could: `.btn--small` never overrode the `width: 100%` on
`.btn--primary`/`.btn--secondary`, so "Add to breakfast" measured **264px on a 390px
viewport** — 68% of the screen, wedged beside its heading. Fixed, and the label shortened
to `+ Add` with the full phrase kept as its accessible name, matching the spec's mockup.

**What was NOT verified:** the app on a real phone. Everything above is Chrome at a phone
viewport, which does not exercise the PWA install path, real touch targets, iOS Safari's
date input, or `crypto.randomUUID` being undefined over plain HTTP on a LAN address — the
case `newId()` exists for. Someone should run `npm run dev -- --host` and open it on the
actual device before this is relied on daily.

---

## 7. Process notes for Phase 4

- **Node 22.12 or later is mandatory.** Under 22.7 every test file fails to load with
  `ERR_REQUIRE_ESM` from jsdom's `html-encoding-sniffer`, which needs `require(esm)`. It
  looks like catastrophic breakage and is a version. Every dispatch in this phase carried
  the `PATH` line; the shell still defaults to 22.7. **Fix this at the source.**
- **Run all three commands after every task.** Held throughout; no build ever broke.
- `@testing-library/user-event` is now a declared dev dependency. It was added by an
  implementer and left uncommitted, which made a committed test import a package the
  committed manifest did not declare — a clean `npm ci` at that commit would have failed.
  It passed locally only because `node_modules` already held it.
- **Batching same-shape tasks worked.** Five pairs went out as single dispatches with one
  review each, and none of those reviews suffered for it.
- Two subagents died mid-task on API rate limits, one after committing and one after
  completing the work uncommitted. In both cases the controller gathered and recorded the
  evidence the dead agent never wrote, rather than taking its word or re-running it.

## 8. What Phase 4 inherits

Phase 4 is the Costs screen: the sortable purchase table, totals by location and period,
CSV export, and JSON backup/restore.

- **The error boundary exists**, which Phase 2's record made a prerequisite for restore.
  `App` wraps `<main>`, keyed on the tab, with a way back to Log.
- **Restore writes rows without going through the validated forms**, which is precisely the
  case Phase 2 §4b warned about: `batchState` and `g()` throw on a corrupt row rather than
  misclassifying it. The boundary catches that now, but restore should validate before it
  writes rather than relying on the net.
- **Schema v3.** Phase 4 adds nothing yet. `SCHEMA_V1`/`V2`/`V3` are exported from `db.ts`
  and `migration.test.ts` builds throwaway databases from them, so the test cannot drift.
  Export `SCHEMA_V4` the same way.
- **Restore must respect the cascades**, which now number three: batch → sessions →
  entries, session → entries, and profile → entries + day logs. A restore that writes
  entries whose `cookSessionId` or `profileId` do not resolve recreates §3 by hand.
- `cost.ts` is unchanged and still has the duplicated `sessionsOf` filtering Phase 2 noted.
