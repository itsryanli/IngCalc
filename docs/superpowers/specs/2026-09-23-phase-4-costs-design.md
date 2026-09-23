# IngCalc Phase 4 — Costs: the purchase table, CSV export, and backup/restore

**Date:** 2026-09-23
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md`
**Read first:** `docs/superpowers/2026-09-20-phase-3-execution-record.md` §7–8

---

## 1. What this document is

An addendum, not a replacement. The parent spec gives Phase 4 its place (§8: *"Costs
tab, protein per MYR, CSV export, JSON backup/restore — the analysis layer"*) and one
sentence of screen (§5: *"purchase table sorted by any column, protein per MYR, totals
by location and by period, CSV export, JSON backup and restore"*).

This records the decisions that sentence left open:

| Question | Decision |
|---|---|
| Restore semantics | **Both** replace-all and merge, chosen at restore time |
| Merge conflicts (same id on device and in backup) | **Device wins.** Merge only adds; it can never destroy |
| CSV scope | **Two files**: `purchases.csv` and `meals.csv` |
| Period totals | **Range filter** (this month / last 3 months / this year / all time) scoping the whole screen, plus **per-month** totals |
| Table at phone width | A real `<table>` in its **own horizontal scroll box**, ingredient column pinned |
| Backup validation | **Hand-written pure validators** plus a referential-integrity and lifecycle pass. No new dependency |

Price, location and date have been captured since Phase 2. Phase 4 adds **no schema
change**: it is a reporting view plus an import/export path over schema v3.

The one part of this phase that can do damage is restore, because it is the first code
path that writes rows without going through the validated forms. Phase 2 §4b and Phase
3 §8 both warned about exactly this. Most of this document's care goes there.

---

## 2. Module layout

| Module | Kind | Responsibility |
|---|---|---|
| `core/costs.ts` | pure | Purchase rows, range filtering, sorting, totals by location and month, CSV row builders |
| `core/csv.ts` | pure | `toCsv(headers, rows)`: quoting, injection guard, BOM, CRLF. Knows nothing about the domain |
| `core/cost.ts` | pure, **extended** | Gains `entryCostMYR` |
| `core/backup.ts` | pure | Envelope parsing, per-table row guards, integrity pass, merge planning |
| `storage/backup.ts` | I/O | `exportAll()`, `restore(parsed, mode)` |
| `ui/download.ts` | browser | `downloadText(filename, mime, text)`: Blob → object URL → `<a download>` click → revoke |
| `ui/screens/CostsScreen.tsx` | UI | The screen |
| `ui/components/RangePicker.tsx` | UI | Four-option segmented control |
| `ui/components/PurchaseTable.tsx` | UI | Sortable table |
| `ui/components/TotalsList.tsx` | UI | Shared by the location and month totals |
| `ui/components/DataPanel.tsx` | UI | Export buttons, backup, the restore flow |

`core/` stays pure. `core/purity.test.ts` already enforces that no `core/` module
imports storage or React. The new modules fall under it without change.

---

## 3. The Costs screen

### 3.1 Data

The screen reads the existing `useKitchen()` (batches, sessions, entries) and resolves
ingredients from **all** of them: `INGREDIENTS` plus **every** user ingredient,
including archived ones.

That is deliberately *not* `useCatalogue()`. `mergeCatalogue` filters out archived
ingredients, which is right for a picker and wrong here: a batch bought before its
ingredient was archived is still spending, and would otherwise render as *Unknown
ingredient*. Costs loads `listUserIngredients()` itself and builds its lookup with a
small pure `ingredientLookup(bundled, user)` in `core/costs.ts`.

`App.tsx`: the Costs tab loses `phase: 4` and joins `BUILT`. `Settings.landingTab` is
unchanged; Costs is not offered as a landing tab.

### 3.2 Range

```ts
export type CostRange = 'thisMonth' | 'last3Months' | 'thisYear' | 'all';
export function inRange(date: IsoDate, range: CostRange, today: IsoDate): boolean;
```

Calendar-based, against `purchase.date` and `todayIso()`:

- `thisMonth`: same `YYYY-MM` as today.
- `last3Months`: today's month and the two before it. From January this reaches back
  into November and December of the previous year.
- `thisYear`: same `YYYY`.
- `all`: everything.

Dates are compared as strings on their `YYYY-MM` prefix. No `Date` arithmetic, so no
time-zone or rollover surface (see Phase 2's `formatIsoDate` rollover note).

The default is `thisMonth`. The range scopes **every** section below it, including both
CSV exports. It is not persisted; it resets when the tab is left.

### 3.3 Summary line

`RM 142.30 · 11 purchases · 9.8 g protein per RM`

Protein per RM here is total raw protein ÷ total spent across the range. That is a
weighted figure, **not** the mean of the per-row figures. A mean would give a RM 2 bag
of kangkung the same weight as a RM 40 chicken. If total spent is zero, it is `—`.

### 3.4 Purchase table

```ts
export interface PurchaseRow {
  batchId: string;
  date: IsoDate;
  ingredient: string;          // name, or 'Unknown ingredient'
  location: string;            // as stored
  rawWeightG: Grams;
  priceMYR: MYR;
  myrPerKgRaw: MYR | null;
  proteinPerMYRRaw: number | null;
  cookedG: Grams | null;       // null when never cooked
  myrPerKgCooked: MYR | null;
  proteinPerMYRCooked: number | null;
}
export function purchaseRows(batches, sessions, lookup, retention): PurchaseRow[];
```

Every figure comes from the existing `cost.ts` functions: `costPerKgRaw`,
`proteinPerMYRRaw`, `costPerKgCooked`, `proteinPerMYRRetained`. Nothing is recalculated
a second way.

**Columns**, in order: **Ingredient** (pinned), Date, Location, Weight, Price, RM/kg,
g protein/RM (raw), g protein/RM (cooked).

**Sorting.**

```ts
export type SortKey = keyof Omit<PurchaseRow, 'batchId' | 'cookedG'>;
export interface Sort { key: SortKey; dir: 'asc' | 'desc'; }
export function sortRows(rows: readonly PurchaseRow[], sort: Sort): PurchaseRow[];
```

- Tapping a header sorts by it, and tapping the active header reverses it. A new column
  starts `desc` for numbers and dates and `asc` for text.
- The default is `{ key: 'date', dir: 'desc' }`.
- **`null` sorts last in both directions.** Otherwise an uncooked batch would rise to
  the top of a descending "cooked g/RM" sort.
- Text compares with `localeCompare(…, { sensitivity: 'base' })`.
- **Stable**: ties keep the incoming order, which is `createdAt` descending. Sorting by
  date therefore keeps the entry order within a day.

The header cells are `<button>`s inside `<th>`s. The active `<th>` carries
`aria-sort="ascending"|"descending"` and the others carry none. A visible arrow follows
the direction.

**Layout.** The table sits in a `div.table-scroll` with `overflow-x: auto`. The
ingredient column is `position: sticky; left: 0` with an opaque background token, so the
scrolled cells pass under it rather than showing through. The page itself must never
scroll horizontally (verified in §8).

**Formatting**: `formatMYR`, `formatG`, one decimal for g/RM, `formatIsoDate` for
dates, and `—` for null.

### 3.5 By location

```ts
export interface TotalRow { key: string; label: string; count: number; spentMYR: MYR; share: number; }
export function totalsByLocation(rows: readonly PurchaseRow[]): TotalRow[];
```

- The grouping key is `location.trim().toLocaleLowerCase()`. "Tesco" and "tesco " are
  one row.
- The label is the spelling on the **most recent** purchase in the group (by `date`,
  then by input order).
- A blank or whitespace-only location groups under the label **No location**.
- `share` = group spent ÷ range spent, or 0 when range spent is 0.
- Sorted by spent descending, then label ascending.

### 3.6 By month

`totalsByMonth(rows): TotalRow[]`, keyed `YYYY-MM` and labelled like "Sep 2026".
Newest first. `share` is computed the same way but not displayed.

### 3.7 States

| State | Shown |
|---|---|
| Loading | The existing loading pattern |
| `storageError` | The existing `banner--warn` pattern. The Data panel still renders |
| No batches at all | Empty state: *"Nothing bought yet — purchases you log in Kitchen appear here."* The Data panel still renders, because restoring onto an empty device is the main use of restore |
| Batches, but none in range | *"Nothing bought in this period."* The totals sections are hidden and the Data panel still renders |
| Batch with an unresolvable ingredient | *Unknown ingredient*; protein columns `—`; the row still counts towards spending |

---

## 4. CSV export

### 4.1 `core/csv.ts`

```ts
export type CsvCell = string | number | null;
export function toCsv(headers: readonly string[], rows: readonly CsvCell[][]): string;
```

- Output starts with a UTF-8 BOM (`﻿`), so Excel reads non-ASCII names correctly.
- Rows are separated by `\r\n`, and the output ends with a trailing `\r\n`.
- `null` → an empty cell.
- Numbers are written with `String(n)` after the caller has rounded them. `toCsv` never
  formats, localises or adds `RM`.
- **Quoting (RFC 4180):** a string containing `,` `"` `\r` or `\n` is wrapped in `"`,
  with each inner `"` doubled.
- **Formula-injection guard:** a *string* cell whose first character is `=` `+` `-` `@`
  `\t` or `\r` is prefixed with `'` **before** quoting. Numbers are never touched. This
  matters because ingredient names and locations are free text, and a backup or CSV can
  be shared.

### 4.2 Rounding

The CSV layer rounds explicitly and consistently: grams to 1 decimal, MYR to 2, g/RM to
2, kcal to 0, protein g to 1. This happens in the row builders in `core/costs.ts`, not
in `toCsv`.

### 4.3 `purchases.csv`

One row per batch in range, in the table's current sort order:

```
date,ingredient,location,raw_weight_g,price_myr,myr_per_kg_raw,protein_g_per_myr_raw,cooked_g,myr_per_kg_cooked,protein_g_per_myr_cooked,batch_id
```

`cooked_g` is the sum of the batch's sessions' `cookedWeightG`, empty if there are none.

### 4.4 `meals.csv`

One row per meal entry whose `date` is in range, across **all profiles**, ordered by
date, then profile name, then meal slot order, then `createdAt`:

```
date,profile,meal,kind,item,cooked_g,portions,kcal,protein_g,cost_myr,batch_id
```

- `item` is the **name** only, without the amount suffix, since amounts have their own
  columns. `describeEntry` (`ui/labels.ts`) currently builds name and amount in one
  string, so its name half is extracted as `entryItemName(entry, ctx)` and moved to
  `core/costs.ts`. `describeEntry` then calls it. The two can never disagree, and
  nothing string-splits a label.
- `cooked_g`: the grams eaten. For `portion` entries this is `portionsToGrams`, for
  `weight` entries `grams`, for `ingredient` entries `cookedG`, and for `quick` entries
  empty.
- `portions`: only for `portion` entries.
- `kcal`, `protein_g`: from `entryNutrients`, so the figures match the Log exactly. For
  a `quick` entry with no `proteinG`, the protein cell is empty, not 0.
- `cost_myr`: from `entryCostMYR` (§4.5). Empty for `ingredient` and `quick` entries.
- `batch_id`: for session-backed entries, the session's batch. Otherwise empty. This is
  what lets the two files be joined in Excel.
- An entry whose profile no longer resolves cannot exist after Phase 3's cascade. If one
  somehow does, the profile cell reads `Unknown profile` and the row is still written.

### 4.5 `entryCostMYR`

Added to `core/cost.ts`:

```ts
export function entryCostMYR(entry: MealEntry, session: CookSession, batch: Batch): MYR | null;
```

The share of the purchase price belonging to this cook, times the fraction of the cook
this entry ate:

`batch.pricePaidMYR × (session.rawUsedG / batch.rawWeightG) × (gramsEaten / session.cookedWeightG)`

`gramsEaten` is `entrySessionGrams(entry, session)`, the same helper the remainder
derivation uses. It returns `null` for non-session entries, `rawWeightG <= 0` or
`cookedWeightG <= 0`.

**Invariant (tested):** once a cook is fully eaten, its entries' costs sum to that cook's
share of the purchase price, within `EPSILON`.

### 4.6 Download

`ui/download.ts` creates a `Blob`, an object URL, clicks a temporary `<a download>`,
then revokes the URL on the next tick. The filenames are:

- `ingcalc-purchases-<range>.csv` and `ingcalc-meals-<range>.csv`, where `<range>` is
  `2026-09` (this month), `2026-07-to-2026-09`, `2026` or `all`.
- `ingcalc-backup-<YYYY-MM-DD>.json`.

The export buttons are disabled when their file would have no rows.

---

## 5. Backup and restore

### 5.1 File format

```ts
export const BACKUP_APP = 'ingcalc';
export const CURRENT_SCHEMA_VERSION = 3;

export interface BackupFile {
  app: 'ingcalc';
  schemaVersion: number;          // the Dexie version that wrote it
  exportedAt: string;             // ISO instant, informational only
  tables: {
    profiles: Profile[];
    userIngredients: Ingredient[];
    settings: Settings[];          // zero or one row
    batches: Batch[];
    cookSessions: CookSession[];
    mealEntries: MealEntry[];
    dayLogs: DayLog[];
  };
}
```

It is pretty-printed JSON with 2-space indentation. Size is not a concern: a year of
daily use is on the order of a few MB.

`CURRENT_SCHEMA_VERSION` must equal the highest `this.version(n)` in `db.ts`. A test
asserts this (`db.verno`), so bumping the schema without deciding what old backups mean
fails loudly.

### 5.2 Backup

`exportAll()` reads all seven tables inside **one `'r'` transaction**, so the snapshot is
consistent, and returns a `BackupFile`. It is always the full database, never
range-filtered.

### 5.3 The restore pipeline

Nothing is written until every step before the write has passed. Steps 1–5 are pure
(`core/backup.ts`) apart from reading the file. Only step 7 touches the database.

**1. Read.** A file over **20 MB** is refused before reading: *"That file is too large to
be an IngCalc backup."*

**2. Parse.** `JSON.parse` failure → *"This isn't a readable backup file."*

**3. Envelope.**
- `app !== 'ingcalc'` → *"This isn't an IngCalc backup."*
- `schemaVersion` not a positive integer → the same message.
- `schemaVersion > CURRENT_SCHEMA_VERSION` → *"This backup was made by a newer version of
  IngCalc. Update the app, then restore."*
- `tables` missing or not an object → *"This isn't an IngCalc backup."*
- A missing table is treated as `[]`, since v1→v3 only ever added tables. A table
  present but not an array is rejected. Unknown extra tables are ignored.

**4. Rows.** One guard per table: `isProfile`, `isIngredient`, `isSettings`, `isBatch`,
`isCookSession`, `isMealEntry`, `isDayLog`. Each checks every field's type, and:

- ids are non-empty strings;
- weights (`rawWeightG`, `rawUsedG`, `cookedWeightG`, `grams`, `cookedG`) are finite and
  **> 0**; `pricePaidMYR` is finite and ≥ 0;
- `IsoDate` fields match `^\d{4}-\d{2}-\d{2}$` **and** are real calendar dates
  (`2026-02-30` fails);
- enum fields are members of `COOK_METHODS`, `MEAL_LABEL_KEYS`, `CATEGORIES`, the sex
  and goal unions, and the settings unions;
- `MealEntry` is checked per `kind`, with that kind's fields required: `portions`
  finite and > 0, `kcal` finite and > 0, and `proteinG` absent or finite ≥ 0;
- `Ingredient.per100gRaw` has every `NUTRIENT_KEYS` key, finite and ≥ 0.
  `userIngredients` rows must have `source: 'user'`;
- `portionCount` is an integer ≥ 1;
- the table has **no duplicate ids**;
- a `DayLog`'s `id === \`${profileId}:${date}\``;
- `settings` has at most one row, and its `id === 'singleton'`.

Failures are **collected, not first-only**, then grouped and counted per table and
reason. They are reported as up to five lines, e.g. *"3 meal entries have an invalid
date."* One corrupt row rejects the whole file.

**5. Integrity**, run over the dataset the restore **would produce**. For replace, that
is the backup alone. For merge, it is device ∪ backup with the device winning on id
(§5.4).

- **References resolve:** session → batch; session-backed entry → session; entry →
  profile; `ingredient` entry and batch → ingredient (`INGREDIENTS` ∪ the resulting
  `userIngredients`, archived included); dayLog → profile.
- **Lifecycle invariants hold**, using the existing `core/batch.ts` helpers so there is
  one definition:
  - for each batch, Σ `rawUsedG` of its sessions ≤ `rawWeightG` + `EPSILON`;
  - for each session, `consumedFromSession` ≤ `cookedWeightG` + `EPSILON`.

  This matters most for merge. Backup meals landing on the device's version of a cook can
  over-consume it even though every row is individually valid.
- `settings.activeProfileId` that does not resolve is **coerced to `null`**, not
  rejected. It is harmless and is not worth refusing a restore over.

The failure messages have the same collected, counted form: *"4 meal entries refer to
cook sessions that aren't in the backup."* For merge, the wording says *"…aren't in the
backup or on this device."* An over-consumption message names the ingredient and cook
date.

**6. Preview and confirm.**

```ts
export interface RestorePlan {
  mode: 'replace' | 'merge';
  perTable: Record<TableName, { incoming: number; added: number; alreadyPresent: number; erased: number }>;
}
```

The preview shows counts for the tables a person recognises: profiles, your ingredients,
purchases, cooks, meals. `dayLogs` and `settings` are counted but not listed.

- **Merge**: *"Adds 12 purchases, 30 cooks and 88 meals. 40 items are already on this
  device and will be kept as they are."* Button: **Merge into this device**.
- **Replace**: *"This erases everything on this device — 8 purchases, 23 cooks, 140
  meals and 2 profiles — and replaces it with the backup."* Buttons: **Download a backup
  of this device first**, then **Erase and restore**, styled as destructive.

Both previews have **Cancel**.

**7. Write.** One `'rw'` transaction over all seven tables.

- **Replace**: `clear()` every table, then `bulkAdd` every table from the backup.
  Settings come from the backup, with `activeProfileId` coerced (§5.3.5). With no
  settings row in the backup, the settings table is left empty and `getSettings()`
  falls back to its defaults.
- **Merge**: inside the transaction, read every table's **rows** (the lifecycle check
  needs the device's sessions and entries, not just their ids), **re-run step 5**
  against them, and `bulkAdd` only rows whose id is absent. The device's
  settings row is never touched. Re-running step 5 closes the gap between the preview
  and the write. Another tab could have written in between, and a stale plan must not be
  applied.

If anything throws, Dexie aborts the transaction and nothing is changed. The UI says
*"The restore failed and nothing was changed."* and `console.error`s the real error,
per Phase 2 §4b.

**8. Refresh.** `App` gets `onDataReplaced()`. It calls `useProfiles().refresh()`,
re-reads settings for the active profile, and increments a `dataGeneration` counter that
is part of `<main>`'s `ErrorBoundary` `resetKey` and the screens' `key`. Every hook
remounts and re-reads. There is no `location.reload()`. The user stays on Costs, which
shows a success line: *"Restored. 8 purchases, 23 cooks and 140 meals."*

### 5.4 Merge semantics

For every table, a backup row whose primary key already exists on the device is
**skipped**, and the device's row is kept unchanged. This includes `dayLogs`, whose
natural key means the device's frozen target snapshot for that profile-day survives, per
the parent spec §6: history does not rewrite itself. Settings are always the device's.

Merge therefore never modifies or deletes a device row. Replace is the tool for rolling
back.

### 5.5 What restore does NOT do

- Migrate old *shapes*. v1→v3 only added tables, so there is nothing to migrate yet. The
  first schema change that alters a row shape must add a migration step here, and the
  fixture test in §8 fails until it does.
- Restore built-in ingredients. They are code, not data.

---

## 6. The Data panel

The panel sits at the bottom of Costs, under the heading **Your data**:

- **Export purchases (CSV)** and **Export meals (CSV)**. Both follow the range and are
  disabled when their file would be empty.
- **Download backup (JSON)**, with the note *"Everything on this device, in one file.
  Keep it somewhere other than this phone."*
- **Restore from backup…**, a visually hidden `<input type="file" accept=".json,application/json">`
  behind a button. After a file is chosen and passes steps 1–4, the panel shows the
  choice **Merge** / **Replace**, then the step-6 preview for the chosen mode. Step 5
  runs when a mode is chosen, because its result depends on the mode. A failure at any
  step shows an inline `role="alert"` message and returns the panel to its initial
  state.

---

## 7. Error handling

| Case | Behaviour |
|---|---|
| Backup read or JSON write fails | *"The backup could not be created."* The real error goes to `console.error` |
| Corrupt stored row reaches Costs | Row guards are not applied to live data. `ErrorBoundary` (Phase 3) catches a throw from `g()`/`myr()` and offers the way back to Log. Same as every other screen |
| Restore fails at any step | Specific message (§5.3). Nothing written |
| Restore write throws | Transaction aborts. *"…nothing was changed."* Real error to console |
| Download blocked by the browser | Nothing detectable. Out of our control and not handled |

---

## 8. Testing

Test-first throughout. Run `npm test`, `npm run lint` and `npm run build` after every
task.

- **`csv.test.ts`**: comma, quote, CR, LF, and a mixed field; each of the six injection
  prefixes on strings; a negative *number* cell is **not** prefixed; `null` → empty;
  BOM present; CRLF separators and a trailing CRLF.
- **`costs.test.ts`**:
  - `inRange`: first and last day of a month; a December date in `thisYear` vs next
    January; `last3Months` from January reaching back into November and December;
    `all`.
  - `sortRows`: every key in both directions; **nulls last both ways**; ties stable;
    text case-insensitive.
  - `totalsByLocation`: case and whitespace folding; the most recent spelling wins;
    blank → *No location*; share; zero-spend range.
  - `totalsByMonth`: grouping, labels, ordering.
  - Summary protein per RM is **weighted**, with a fixture where the weighted and mean
    figures differ.
  - `ingredientLookup` resolves an **archived** user ingredient.
  - The CSV row builders round per §4.2 and order per §4.3–4.4.
- **`cost.test.ts`**: `entryCostMYR` for portion and weight entries, and null for the
  rest; **the fully-eaten invariant** (§4.5).
- **`backup.test.ts`** (pure):
  - Every guard gets one **falsification** test per checked field: take a valid row,
    break exactly that field, and assert rejection with the expected reason.
  - Envelope: wrong app, a non-integer version, a newer version, missing tables → `[]`,
    a non-array table.
  - Integrity: each dangling-reference kind; raw over-consumption; cooked
    over-consumption in a **corrupt backup** and as a **merge of individually valid
    rows**; `activeProfileId` coercion.
  - Failure grouping and counting.
- **Fixture: `src/storage/__fixtures__/backup-v3.json`**, a small but complete v3 backup
  covering every table and every `MealEntry` kind. A test asserts it restores in both
  modes, **forever**. Bumping `CURRENT_SCHEMA_VERSION` without handling old backups
  fails here.
- **`CURRENT_SCHEMA_VERSION === db.verno`**.
- **`storage/backup.test.ts`** (fake-indexeddb):
  - `exportAll` → `restore(replace)` → `exportAll` deep-equals the original apart from
    `exportedAt`.
  - Merge adds only missing rows, and a device row with the same id is unchanged.
  - An **injected failure mid-write** (a `bulkAdd` that throws on the last table) leaves
    every table exactly as before, in both modes.
  - Merge re-validates inside the transaction: a conflicting row written between plan
    and write causes rejection, not corruption.
- **UI**:
  - `PurchaseTable`: a header click sorts and sets `aria-sort`; a second click reverses.
  - `CostsScreen`: the range scopes the table and both totals; both empty states; an
    archived ingredient's name shows.
  - `DataPanel`: each rejection message appears as an alert; preview counts; Cancel
    returns to the initial state; replace and merge each call through and trigger
    `onDataReplaced`.
  - `App`: the Costs tab is enabled and selectable.
- **Phone-width visual pass**, as in Phase 3 §6: Playwright in the scratchpad (not the
  project), installed Chrome at 390×844, both colour schemes. It covers zero page-level
  horizontal overflow with the table scrolling inside its own box and the pinned column
  opaque; both CSV downloads; a backup → erase → restore round trip against real
  IndexedDB; and zero console errors.

---

## 9. Housekeeping carried in from Phase 3

- **`test.pool: 'threads'` in `vite.config.ts`**, as its own commit. Phase 3 §5 diagnosed
  the fork pool as the cause of the spurious suite failures on this machine.
- **Node ≥ 22.12** remains mandatory for tests. The fix belongs in the developer's shell
  profile, not the repo. Every command in the plan carries the `PATH` override.

---

## 10. Not in Phase 4

| Item | Why |
|---|---|
| "Last backed up N days ago" reminder | Needs a settings field with its own rules on restore. Worth doing; not needed to make backup work |
| `.xlsx` export | Parent spec non-goal. CSV opens in Excel |
| Charts | Parent spec non-goal |
| Costs as a landing tab | Not asked for |
| Merge where the backup wins | Rejected: rows have no `updatedAt`, so "newer" is unknowable |
| Migrating old row shapes on restore | Nothing to migrate yet (§5.5) |
| Deduplicating `sessionsOf` calls in `cost.ts` | Phase 2 deferral. Only touched if `entryCostMYR` lands on those lines |
