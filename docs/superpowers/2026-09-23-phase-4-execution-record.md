# IngCalc Phase 4 — Execution record

**Date:** 2026-09-23 → 2026-09-24
**Branch:** `phase-4-costs`, cut from `phase-3-today` @ `4e96bc8` (Phase 3 is not yet merged to `main`)
**Spec:** `docs/superpowers/specs/2026-09-23-phase-4-costs-design.md`
**Plan:** `docs/superpowers/plans/2026-09-23-ingcalc-phase-4.md`
**Method:** subagent-driven: a fresh implementer per task or batch, a task review after each, one
final whole-branch review, and one fix wave.

---

## 1. What shipped

The Costs tab is on. It has:

- A **range picker** (this month / last 3 months / this year / all time) that scopes the whole screen.
- A **weighted summary**: spend, number of purchases, and protein per RM across the range.
- A **sortable purchase table**. It scrolls sideways inside its own box under a pinned ingredient
  column, and empty values sort last in both directions.
- **Totals by location** (grouping ignores case and spacing) and **totals by month**.
- **Two CSV exports**, `purchases.csv` and `meals.csv`. Both follow the range; the meals file has a
  cost column for entries that trace back to a purchase.
- **JSON backup** of all seven tables, restorable by **Replace** or **Merge** (add-only; the device
  wins on a shared id).

Restore runs as a pipeline, and nothing is written until the user confirms:

1. Size check.
2. Parse.
3. Envelope check.
4. Every row checked field by field, with upper bounds.
5. An integrity pass over the dataset the restore *would produce*: every reference resolves and the
   lifecycle invariants hold.
6. A preview.
7. The write, in one read-write transaction that plans again against the live device before writing.

A failed write rolls back every table, including ones Replace had already cleared. A tested fixture
proves this.

| | Before | After |
|---|---|---|
| Test files | 50 | 60 |
| Tests | 637 | 880 |
| Lint warnings | 1 (`WeightInput.tsx:23`) | 1 (same) |
| Schema version | 3 | 3 (no change) |
| Dependencies | — | none added |

`src/core/golden.test.ts` is untouched. `src/storage/__fixtures__/backup-v3.json` has exactly one
commit and **must never be edited**: a future schema that cannot restore it is the bug.

---

## 2. Where the plan departed from the spec

The plan listed seven deliberate deviations, all held:

1. `Settings` moved into `core/types.ts`, because `core/` cannot import `storage/`.
2. `entryItemName` lives in `ui/labels.ts`, because it needs the UI's method labels.
3. `PurchaseRow` gained `proteinRawG`, and `SortKey` became the eight-column union.
4. The summary's protein ratio divides by the spend on rows whose protein is known.
5. The row guards are table-driven.
6. There is no remount after a restore.
7. A blank location sorts like a missing value.

The final review found an eighth that was never listed. The **restore copy differs from the spec's**:

- The replace preview names what the backup brings.
- The success line reads "Restored 8 purchases…" rather than "Restored. 8 purchases…".
- An empty device gets its own sentence.

These are improvements, recorded here as deviation 8.

---

## 3. What review changed

**Task 12: a race in the restore panel.** Choosing Merge or Replace starts an asynchronous preview.
Cancel, or a second mode click, during that wait could be overridden when the stale promise
resolved, which could reopen the *Erase and restore* screen after the user had cancelled. The
brief's own code had this. It was fixed by disabling the three mode buttons while the preview loads,
and a test gates the preview promise to prove it.

**Tasks 10–11 → 15: the pinned column.** The Task 11 review found no CSS for the sticky column. The
plan had put all styles in Task 15, so this was ruled as expected and passed on. Task 15 delivered
the rule, and the Task 15 review checked the tokens and specificity by reading. **Only the phone
visual pass caught that it was still wrong.** `.table-scroll` has a 16px `padding-inline`, so the
sticky cell pinned to the content edge while the scrollport clipped at the padding edge. Scrolled
text showed in the strip to its left (the header rendered "ATIINGREDIENT"), and the collapsed header
border broke under the sticky cell. The fix moves the inset from the scroll box onto the table's edge
cells, for this table only (`.table-scroll--pinned`), and switches the table to separate borders. The
final reviewer checked it in headless Chrome against the real stylesheet first. A box-shadow on the
sticky cell was tried and does not paint on table cells.

**For the next phase:** a code review cannot find a layout bug that only appears once the page is
scrolled. The visual pass has to scroll.

**The final fix wave** (one dispatch, five commits, one scoped re-review) also:

- **Bounded the numbers a backup may carry.** Before this, a hand-edited file with
  `pricePaidMYR: 1e308` passed every check and restored, and then `summarise` → `myr(Infinity)`
  threw on every Costs render. Costs hosts the only restore UI, so the user could not restore their
  way out. The bounds are form-scale:
  - weights ≤ 1,000,000 g and price ≤ RM1,000,000
  - portions ≤ 1000
  - nutrients per 100g ≤ 100,000
  - day targets ≤ 1,000,000

  Tests cover values just over each bound and values exactly at it.
- **Wrapped the CSV exports.** They run in `onClick`, where the ErrorBoundary does not reach, so a
  failure was silent. They now show "The export could not be created." and log the real error.
- **Changed the restore panel's order and keys.** "Download a backup of this device first" now comes
  before "Erase and restore", as in the spec. Alert lines are keyed by index, and the file input
  resets after each pick so the same file can be chosen again.
- **Held the download URL for 30 seconds before releasing it.** Releasing it on the next tick can
  cancel the download on WebKit/iOS.

---

## 4. Deferred, with locations

| Item | Where | Why deferred |
|---|---|---|
| **Log and meals CSV can disagree for an archived ingredient** | `LogScreen.tsx` / Kitchen via `useCatalogue` vs Costs via `ingredientLookup` | The Log resolves ingredients through the picker catalogue, which drops archived ones, so it shows "Unknown ingredient" and 0 kcal where the CSV shows the real figures. Nothing in today's UI archives an ingredient, but a restored backup can carry `archived: true`, and the v3 fixture does. This is a Phase 3 resolution bug made visible. Fix: resolve *stored* rows in Log and Kitchen with `ingredientLookup(INGREDIENTS, allUser)`. |
| **Merge brings back rows deleted since the backup; separate devices end up with two same-named profiles** | `core/backup.ts` `planRestore` | Both follow from the spec's add-only-by-id rule; there are no deletion markers. The preview does not say so. Adding a sentence is a product decision. |
| **MethodCompare's sticky column has the same gutter bug** | `index.css` `.method-compare th[scope='row']` | Predates this phase. Apply `table-scroll--pinned` there. |
| **Replace with an empty backup reads "the backup's nothing"** | `core/backup.ts` `planSummary` | Awkward, but the sentence still says it erases everything. |
| `planRestore` throws rather than returning a `Result` on overflow | `core/backup.ts` `checkIntegrity` | Unreachable now that the bounds exist, and DataPanel catches it anyway. |
| `proteinRawG` repeats the raw-protein formula in `cost.ts` | `core/costs.ts` `purchaseRows` | Could drift. Sharing one `proteinRawG(batch, ing)` helper would close it. |
| `checkIntegrity` repeats `cookedRawTotalG`; builds lists by spreading, O(n²) per cook | `core/backup.ts` | Negligible at real sizes. |
| Merge `perTable.settings.alreadyPresent` counts skipped settings | `core/backup.ts` | Not displayed. |
| Double session lookup in `entryItemName` + `describeEntry` | `ui/labels.ts` | Plan-specified. |
| No in-flight guard on "Download backup"; a hung preview leaves Cancel disabled | `DataPanel.tsx` | Harmless; switching tabs remounts the panel. |
| Thin tests: merge keeping a device day log; unknown-tables result; zero-row tables; a meal whose batch doesn't resolve; merge-mode multi-table rollback | various | Coverage breadth. Replace-mode rollback is proven. |
| Redundant `eslint-disable` and a misleading doc comment | `RangePicker.tsx` | Cosmetic. |

---

## 5. What was verified, and how

- **The full suite, build and lint after every task.** Every implementer's report carries its
  failing-then-passing test evidence. The controller re-ran all three at the end: 60 files,
  880 tests, a clean build, one warning.
- **A phone-width visual pass, driven through the UI in both colour schemes.**
  - Set-up: `playwright-core` installed in the session scratchpad (the project's `package.json` is
    untouched), driving the installed Chrome at 390×844 with `deviceScaleFactor: 2`. Nothing was
    seeded.
  - Lifecycle: create a profile → three purchases at two locations, one of them named with a comma
    and one dated last month → cook → eat a portion → Costs.
  - Results: zero page errors, zero console errors and zero page-level horizontal overflow at every
    step. The table scrolls inside its box.
  - Sorting: two taps on Price flip both the row order and `aria-sort`.
  - Range: "Last 3 months" brings in last month's purchase.
  - CSV files: both start with the byte-order mark, the comma-named location is quoted, and the meals
    file has exactly one row.
  - Replace: the backup was replace-restored into a **fresh browser context**, and Kitchen and Log
    showed the same text as the original.
  - Merge: merging the same backup back into the original context previews "Nothing in this backup is
    new".
  - Keyboard focus on "Restore from backup…" is visible.
  - The pinned-column defect was found here (§3). After the fix it was re-checked at scroll offsets
    0, 180, 260 and the maximum, in both schemes.
- **The final whole-branch review** traced a two-device merge end to end and found no way to produce
  an orphaned row or a negative remainder. It confirmed that every new colour comes from a token the
  dark block redefines, and that every new `console.error` carries the real error.

**What was NOT verified:**

- The app on a real phone.
- iOS Safari's download behaviour. The 30-second release is based on known WebKit behaviour; it was
  not observed.
- The PWA install path.
- A restore of a large, year-sized backup. The 20 MB ceiling and the O(n²) list building are both
  untested at scale.

Someone should run `npm run dev -- --host`, export a backup on the phone, and restore it into a
private window before relying on backup as the answer to losing the device.

---

## 6. Process notes

- **Batching held up.** Tasks 1+2, 3–5, 7–8, 10–11 and 14–15 each went out as one dispatch with one
  review. None of those reviews was weaker for it: the 7–8 review ran scratchpad probes, and the
  14–15 review checked every token.
- **The cheapest model tier transcribed complete plan code well.** It handled the pure-core tasks and
  the small UI leaves. The mid tier took the backup, storage, panel and screen tasks, and review
  found nothing on any cheap-tier task. The final review ran on the most capable tier and was the one
  that verified the CSS fix before recommending it.
- **Node 22.12 is still not the shell default.** Every dispatch carried the `PATH` line, and it has
  now cost nothing for two phases. Fix it at the source.
- **The threads pool (Task 1) removed the spurious whole-file failures** Phase 3 diagnosed. No run
  in this phase reported a worker-start error.
- One implementer, adding a race test, found that delaying `db.profiles.toArray` inside a Dexie
  transaction breaks Dexie's transaction tracking. Holding back the storage function's own promise
  (`previewRestore`) works instead.

## 7. What maintenance inherits

- **Merge order: Phase 3 first.** `phase-3-today` is not in `main`, and this branch is stacked on
  it.
- **Backup is now the contract with the past.** Any change that alters a stored row's shape needs
  three things:
  - a migration step in `parseBackup`;
  - a bump of `CURRENT_SCHEMA_VERSION` (a test ties it to `db.verno`);
  - the v3 fixture must still restore in both modes.
- **The archived-ingredient divergence (§4) is the first thing to fix** if ingredient archiving ever
  gets a UI.
- `.table-scroll--pinned` is the pattern for any future table with a sticky column.
