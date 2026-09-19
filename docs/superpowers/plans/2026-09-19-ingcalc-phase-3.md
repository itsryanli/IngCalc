# IngCalc Phase 3 — The Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Log screen — a per-day record of what was eaten, measured against
targets frozen at the time — and convert `CookSession.cookedRemainingG` from a stored
field into a figure derived from those meal entries.

**Architecture:** Three new storage tables at schema v3 (`mealEntries`, `dayLogs`), one new
pure core module (`core/meals.ts`) for entry nutrition, entry-aware quantity functions added
to the existing `core/batch.ts`, and a new `LogScreen` with its own `useLog` hook shaped like
the existing `useKitchen`. Consumption moves out of Kitchen entirely and Calc loses its write
path, leaving one screen responsible for each kind of write.

**Tech Stack:** React 19, TypeScript 6, Dexie 4 over IndexedDB, Vitest 4 + Testing Library,
Vite 8, oxlint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-3-log-design.md`
**Also read:** `docs/superpowers/2026-09-19-phase-2-execution-record.md` — it records five
places the Phase 2 plan was wrong and the rulings this phase inherits.

## Global Constraints

- **Node 22.12.0 or later is required to run the test suite at all.** Under 22.7 every test
  file fails to load with `ERR_REQUIRE_ESM` from jsdom's `html-encoding-sniffer`; it needs
  `require(esm)`, unflagged only from 22.12. The failure looks like total breakage and is a
  Node version. `.nvmrc` pins `22.12.0` — run `nvm use` before anything else.
- **Run `npm test`, `npm run build` and `npm run lint` after EVERY task.** Not one of them,
  all three. `vitest` does not typecheck, so only the build catches a type error; only the
  tests catch behaviour. Execution record §2 documents a type error that survived three
  tasks and two code reviews because the build was run at two of seventeen tasks.
- **Baseline to preserve:** 40 test files, 513 tests, clean build, exactly one pre-existing
  lint warning (`WeightInput.tsx:23` react/set-state-in-effect). A second warning is a
  regression.
- **The golden-value suite is not to be touched.** `src/core/golden.test.ts`, 94
  USDA-verified cases. This phase adds no nutrient arithmetic; those cases passing unchanged
  is the evidence that no published figure moved. Do not edit, skip or "update" them. If one
  fails, the implementation is wrong.
- **`src/core/` stays pure.** No imports from `react`, `dexie`, `../ui/` or `../data/`.
  `purity.test.ts` enforces this. Reference tables are passed in as arguments, which is why
  `MealContext` exists.
- **Grams are branded.** Never pass a bare `number` where `Grams` is expected, and never
  cast. Use `g(...)`, which also validates finite and non-negative. Execution record §2: a
  bare `.reduce()` returning `number` into a `Grams` parameter is exactly how the build broke.
- **Dates are local calendar dates.** Use `todayIso()` and `formatIsoDate()` from
  `src/ui/dates.ts`. Never `toISOString()` — in Malaysia that files anything before 8am to
  the previous day.
- **Confirm-plus-error shape (execution record §3.5).** A confirmation question is a plain
  `<p>`. `role="alert"` is reserved for a write that actually failed, renders
  unconditionally, and is cleared by both confirm transitions.
- **Every storage write is wrapped:** try/catch, `console.error` with the real rejection and
  an operation name, a user-facing message via `role="alert"`, and **the success callback is
  not invoked on failure** (execution record §3.4).
- **CSS uses existing tokens only.** `--sp-2/3/4`, `--fs-xs/sm`, `--radius`, `--border`,
  `--surface-sunken`, `--text-dim`, `--accent`, `--danger`/`--danger-soft`,
  `--estimate`/`--estimate-soft`. Inventing a token name with a hard-coded hex fallback
  renders correctly in light mode and wrongly in dark, and no test can catch it
  (execution record §1.5). Check `src/index.css` before using a token.
- **Commit after every task**, conventional-commit style, with the reasoning in the body.

---

## A note on module boundaries

The spec §5 lists `consumedFromSession`, `cookedRemainingG`, `portionsRemaining` and
`entryGrams` under `core/meals.ts`. **They go in `core/batch.ts` instead**, and this is a
deliberate correction made while planning, not a drift.

The reason is a circular import. `cookedRemainingG` needs `entryGrams`, which needs
`portionWeightG` from `batch.ts` — so `meals.ts` must import `batch.ts`. But `batchState`
lives in `batch.ts` and needs `cookedRemainingG` to decide `'finished'` — so `batch.ts`
would import `meals.ts`. Putting the gram-level derivations in `batch.ts` breaks the cycle
and draws a cleaner line anyway:

- **`core/batch.ts` owns grams** — what is left, how many portions that is, what state a
  batch is in, and whether an edit is allowed.
- **`core/meals.ts` owns nutrition** — what an entry is worth, what a day adds up to.

`meals.ts` imports `batch.ts`. Never the reverse.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `src/core/meals.ts` | Entry → nutrients, day → totals, entry validation. Pure. |
| `src/core/meals.test.ts` | Tests for the above. |
| `src/storage/meals.ts` | `mealEntries` and `dayLogs` reads and writes. |
| `src/ui/useLog.ts` | One profile-day's entries and DayLog, with refresh. |
| `src/ui/useLog.test.ts` | Tests for the above. |
| `src/ui/components/ErrorBoundary.tsx` | Catches a render throw, offers a way back. |
| `src/ui/components/ErrorBoundary.test.tsx` | |
| `src/ui/components/DayNav.tsx` | Previous / next / jump-to-date, with the day's name. |
| `src/ui/components/DayNav.test.tsx` | |
| `src/ui/components/DayProgress.tsx` | kcal and protein bars against the day's targets. |
| `src/ui/components/DayProgress.test.tsx` | |
| `src/ui/components/EntryRow.tsx` | One entry, with edit and delete. |
| `src/ui/components/EntryRow.test.tsx` | |
| `src/ui/components/AddEntryForm.tsx` | Three sources behind a segmented control. |
| `src/ui/components/AddEntryForm.test.tsx` | |
| `src/ui/components/MealGroup.tsx` | One label's entries plus its add button. |
| `src/ui/components/MealGroup.test.tsx` | |
| `src/ui/screens/LogScreen.tsx` | The screen: day nav, progress, four groups, nutrients. |
| `src/ui/screens/LogScreen.test.tsx` | |

**Modified**

| File | Change |
|---|---|
| `src/core/types.ts` | Add `MealLabel`, `MealEntryFields`, `MealEntry`, `DayLog`, `MicroTarget`. Remove `CookSession.cookedRemainingG`. |
| `src/core/targets.ts` | Re-export `MicroTarget`; add `snapshotTargets`. |
| `src/core/batch.ts` | Add entry-aware quantities; remove the eat machinery. |
| `src/core/batch.test.ts` | Follow the above. |
| `src/storage/db.ts` | `SCHEMA_V3`, two tables, widen `Settings.landingTab`. |
| `src/storage/kitchen.ts` | `loadKitchen` returns entries; cascade covers them. |
| `src/storage/migration.test.ts` | v2 → v3. |
| `src/storage/storage.test.ts` | Follow the settings change. |
| `src/ui/useKitchen.ts` | Expose meal entries. |
| `src/ui/useKitchen.test.ts` | Follow. |
| `src/ui/components/SessionRow.tsx` | Derived remainder; `EatControl` gone. |
| `src/ui/components/BatchCard.tsx` | Derived cooked-left. |
| `src/ui/components/CookSessionForm.tsx` | Guard the cooked-weight edit. |
| `src/ui/screens/KitchenScreen.tsx` | Thread entries through. |
| `src/ui/screens/CalcScreen.tsx` | Remove the log-as-batch flow. |
| `src/ui/App.tsx` | Log tab, error boundary, landing tab. |
| `src/ui/labels.ts` | `MEAL_LABELS` display text. |
| `src/index.css` | Log screen styles. |

**Deleted**

| File | Why |
|---|---|
| `src/ui/components/EatControl.tsx` | Consumption moves to Log (spec §2). |
| `src/ui/components/EatControl.test.tsx` | |

---
## Task 1: Types and schema version 3

Purely additive. `CookSession.cookedRemainingG` stays for now — Task 6 removes it, once
everything that reads it has a replacement.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/targets.ts:41-44` (move `MicroTarget` out, re-export it)
- Modify: `src/storage/db.ts`
- Modify: `src/storage/settings.ts:3-8`
- Test: `src/storage/migration.test.ts`
- Test: `src/storage/storage.test.ts`
- Modify: `src/ui/App.tsx:9,42` (widen `Tab`; see Step 6)
- Test: `src/ui/App.test.tsx:57` (a `landingTab: 'today'` fixture)

**Interfaces:**
- Consumes: nothing.
- Produces: `MealLabel`, `MEAL_LABEL_KEYS`, `MealEntryFields`, `MealEntry`, `DayLog`,
  `DayLogTargets`, `MicroTarget` from `core/types.ts`; `SCHEMA_V3` and the
  `db.mealEntries` / `db.dayLogs` tables from `storage/db.ts`; `Settings.landingTab`
  widened to `'log' | 'kitchen' | 'calc'`.

- [ ] **Step 1: Write the failing migration test**

Add to `src/storage/migration.test.ts`. Note `SCHEMA_V3` in the import on line 4.

```ts
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from './db';

describe('schema upgrade v2 to v3', () => {
  it('keeps Phase 1 and Phase 2 data and adds the two meal tables', async () => {
    await Dexie.delete(NAME);

    const v2 = new Dexie(NAME);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();
    await v2.table('profiles').put(profile);
    await v2.table('batches').put({
      id: 'b1', ingredientId: 'u1', rawWeightG: 1000,
      purchase: { pricePaidMYR: 20, location: 'Jaya Grocer', date: '2026-09-18' },
      createdAt: 1,
    });
    v2.close();

    const v3 = new Dexie(NAME);
    v3.version(1).stores(SCHEMA_V1);
    v3.version(2).stores(SCHEMA_V2);
    v3.version(3).stores(SCHEMA_V3);
    await v3.open();

    expect(v3.verno).toBe(3);
    expect(await v3.table('profiles').toArray()).toEqual([profile]);
    expect((await v3.table('batches').toArray())).toHaveLength(1);
    expect(await v3.table('mealEntries').toArray()).toEqual([]);
    expect(await v3.table('dayLogs').toArray()).toEqual([]);
    v3.close();
  });

  it('indexes meal entries by profile-and-date and by cook session', async () => {
    await Dexie.delete(NAME);

    const dbv3 = new Dexie(NAME);
    dbv3.version(1).stores(SCHEMA_V1);
    dbv3.version(2).stores(SCHEMA_V2);
    dbv3.version(3).stores(SCHEMA_V3);
    await dbv3.open();

    await dbv3.table('mealEntries').bulkPut([
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: 'm2', profileId: 'p1', date: '2026-09-18', label: 'dinner', createdAt: 2,
        kind: 'weight', cookSessionId: 's1', grams: 50 },
      { id: 'm3', profileId: 'p1', date: '2026-09-19', label: 'snack', createdAt: 3,
        kind: 'quick', name: 'Teh tarik', kcal: 180 },
    ]);

    const day = await dbv3.table('mealEntries')
      .where('[profileId+date]').equals(['p1', '2026-09-19']).toArray();
    expect(day.map((e) => e.id).sort()).toEqual(['m1', 'm3']);

    // A quick entry has no cookSessionId, and Dexie omits rows whose indexed key is
    // undefined — so session queries exclude them by construction, not by a filter.
    const forSession = await dbv3.table('mealEntries')
      .where('cookSessionId').equals('s1').toArray();
    expect(forSession.map((e) => e.id).sort()).toEqual(['m1', 'm2']);

    dbv3.close();
  });
});
```

Also update the existing fresh-install test's table list — it asserts the exact set, so it
fails until v3 is declared:

```ts
  it('opens straight at version 3 on a fresh install', async () => {
    await Dexie.delete(NAME);

    const fresh = new Dexie(NAME);
    fresh.version(1).stores(SCHEMA_V1);
    fresh.version(2).stores(SCHEMA_V2);
    fresh.version(3).stores(SCHEMA_V3);
    await fresh.open();

    expect(fresh.verno).toBe(3);
    expect(fresh.tables.map((t) => t.name).sort()).toEqual(
      ['batches', 'cookSessions', 'dayLogs', 'mealEntries', 'profiles', 'settings', 'userIngredients'],
    );
    fresh.close();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/storage/migration.test.ts`
Expected: FAIL — `SCHEMA_V3` is not exported from `./db`.

- [ ] **Step 3: Add the types**

In `src/core/types.ts`, after the `CookSession` interface:

```ts
/**
 * A population-table target for one micronutrient. Lives here rather than in
 * `targets.ts` because `DayLog` embeds it, and `targets.ts` already imports
 * from this module — the other direction would be a cycle.
 */
export interface MicroTarget {
  rni?: number;
  dv?: number;
}

export const MEAL_LABEL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealLabel = (typeof MEAL_LABEL_KEYS)[number];

interface MealEntryBase {
  id: string;
  profileId: string;
  /** Local calendar date. Built with `todayIso`, never `toISOString()`. */
  date: IsoDate;
  label: MealLabel;
  /** Orders entries within a label. */
  createdAt: number;
}

/**
 * The part of an entry a form produces, before it is given an id and a day.
 * Split out so `EntryDraft` and `MealEntry` cannot drift: `Omit` does not
 * distribute over a discriminated union, so composing is the only safe way.
 */
export type MealEntryFields =
  | { kind: 'portion'; cookSessionId: string; portions: number }
  | { kind: 'weight'; cookSessionId: string; grams: Grams }
  | { kind: 'ingredient'; ingredientId: string; method: CookMethod; cookedG: Grams }
  /** `name`, not `label` — `label` is already the meal slot on the base. */
  | { kind: 'quick'; name: string; kcal: number; proteinG?: number };

export type MealEntry = MealEntryBase & MealEntryFields;

export interface DayLogTargets {
  kcal: number;
  proteinG: number;
  micros: Partial<Record<NutrientKey, MicroTarget>>;
}

/**
 * The targets frozen at the moment a day's first entry was written.
 *
 * Without this, editing a profile's weight silently re-reads the entire
 * history: last Tuesday's "78% of target" would start meaning something else.
 */
export interface DayLog {
  /** `${profileId}:${date}` — a natural key, so a duplicate row is impossible. */
  id: string;
  profileId: string;
  date: IsoDate;
  targets: DayLogTargets;
}
```

In `src/core/targets.ts`, delete the local `MicroTarget` interface and re-export the shared
one (the same pattern `nutrition.ts` uses for `CalcStep`):

```ts
// Re-exported so existing importers keep working; the type itself now lives in types.ts,
// because DayLog embeds it and types.ts cannot import from here.
export type { MicroTarget };
```

...adding `MicroTarget` to the existing `import type { ... } from './types';` line.

- [ ] **Step 4: Add the schema**

In `src/storage/db.ts`:

```ts
import type { Batch, CookSession, DayLog, Ingredient, MealEntry, Profile } from '../core/types';

export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: 'log' | 'kitchen' | 'calc';
  defaultWeightUnit: 'g' | 'kg';
}

/**
 * `[profileId+date]` serves the day view, which is the only query the Log screen
 * makes on load. `cookSessionId` serves the remainder derivation in `core/batch.ts`.
 *
 * `quick` and `ingredient` entries carry no `cookSessionId`. Dexie omits rows
 * whose indexed key is undefined, so they are absent from session queries by
 * construction rather than by a filter a caller could forget.
 *
 * `dayLogs` needs no secondary index: its primary key `${profileId}:${date}` is
 * the lookup, and being a natural key makes a duplicate row impossible.
 */
export const SCHEMA_V3: Record<string, string> = {
  mealEntries: 'id, [profileId+date], cookSessionId',
  dayLogs: 'id',
};
```

Add the table fields and the version to the class:

```ts
  mealEntries!: Table<MealEntry, string>;
  dayLogs!: Table<DayLog, string>;
```
```ts
    this.version(3).stores(SCHEMA_V3);
```

In `src/storage/settings.ts`, change the default:

```ts
const DEFAULTS: Settings = {
  id: 'singleton',
  activeProfileId: null,
  landingTab: 'log',
  defaultWeightUnit: 'g',
};
```

- [ ] **Step 5: Fix the settings tests**

`src/storage/storage.test.ts` uses `landingTab: 'today'` in three places (lines 64, 69, 74
at the time of writing — grep for `landingTab` rather than trusting the numbers). Change
`'today'` to `'log'` and leave the assertions otherwise alone. Add one test:

```ts
  it('defaults to the Log tab when nothing is stored', async () => {
    expect((await getSettings()).landingTab).toBe('log');
  });
```

- [ ] **Step 6: Keep the build green in `App`**

Widening `Settings.landingTab` breaks two things in `src/ui/App.tsx`, both because its
local `Tab` union still says `'today'` and not `'log'`:

- `BUILT.includes(settings.landingTab)` at line 42 — `BUILT` is `readonly Tab[]`, so
  passing a value that may be `'log'` is a type error.
- `setTab(settings.landingTab)` in the same expression, for the same reason.

Make the **minimal** change: add `'log'` to the union, keeping every existing member.

```ts
type Tab = 'today' | 'log' | 'kitchen' | 'calc' | 'costs' | 'profile';
```

`'today'` has to stay: `TABS` still contains `{ id: 'today', label: 'Today', phase: 3 }`,
so dropping it from the union fails to typecheck that literal.

Change nothing else in `App.tsx`. `BUILT` still excludes `'log'` and the tab is still not
rendered — Task 16 turns it on. A stored `'log'` falls back to `'calc'` in the meantime,
which is correct: Log does not exist yet.

In `src/ui/App.test.tsx:57`, the fixture `landingTab: 'today'` no longer type-checks.
That line sits in the test *"falls back to Calc when the stored landing tab is not built
yet"*, so its value must be a tab that is **not** in `BUILT` — which after the Phase 2
merge is `['kitchen', 'calc', 'profile']`. Change it to `'log'`: of the three values
`Settings.landingTab` can now hold, it is the only one not built, so it is the only one
that exercises the fallback the test is named for. (`'kitchen'` would make the app
navigate to Kitchen and the assertion fail.)

- [ ] **Step 7: Run the three commands**

```bash
npm test && npm run build && npm run lint
```
Expected: all tests pass (513 + 4 new), clean build, one pre-existing lint warning.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/targets.ts src/storage/db.ts src/storage/settings.ts \
        src/storage/migration.test.ts src/storage/storage.test.ts \
        src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat: add meal entry and day log types at schema v3

Additive only: CookSession.cookedRemainingG stays until everything that
reads it has a replacement.

MicroTarget moves from targets.ts to types.ts because DayLog embeds it
and targets.ts already imports from types.ts, so the other direction
would be a cycle. Re-exported from targets.ts so existing importers are
untouched, the same way nutrition.ts re-exports CalcStep.

MealEntryFields is split from the base so EntryDraft and MealEntry
cannot drift: Omit does not distribute over a discriminated union.

landingTab widens to 'log' | 'kitchen' | 'calc' and defaults to 'log'.
The stored value has never matched the rendered tab bar. App's Tab union
gains 'log' so the comparison still type-checks; the tab itself stays
off until Task 16, so a stored 'log' falls back to Calc for now, which
is correct while Log does not exist."
```

---

## Task 2: `storage/meals.ts`

**Files:**
- Create: `src/storage/meals.ts`
- Test: `src/storage/meals.test.ts`

**Interfaces:**
- Consumes: `MealEntry`, `DayLog` from Task 1; `db` from `storage/db.ts`.
- Produces:
  ```ts
  dayLogId(profileId: string, date: IsoDate): string
  listAllEntries(): Promise<MealEntry[]>
  loadDay(profileId: string, date: IsoDate): Promise<{ entries: MealEntry[]; dayLog: DayLog | null }>
  addEntry(entry: MealEntry, snapshot: DayLog): Promise<void>
  updateEntry(entry: MealEntry): Promise<void>
  deleteEntry(id: string): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/storage/meals.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import { addEntry, dayLogId, deleteEntry, listAllEntries, loadDay, updateEntry } from './meals';
import type { DayLog, MealEntry } from '../core/types';
import { g } from '../core/units';

const targets: DayLog['targets'] = { kcal: 2310, proteinG: 165, micros: { iron: { rni: 14 } } };
const logFor = (profileId: string, date: string): DayLog => ({
  id: dayLogId(profileId, date), profileId, date, targets,
});

const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

beforeEach(async () => {
  await db.open();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('meal storage', () => {
  it('writes the day log alongside the day\'s first entry', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.dayLog?.targets.kcal).toBe(2310);
  });

  it('does not overwrite an existing day log when a second entry lands', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));

    const changed: DayLog = { ...logFor('p1', '2026-09-19'), targets: { ...targets, kcal: 9999 } };
    await addEntry(entry({ id: 'm2', createdAt: 2 }), changed);

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toHaveLength(2);
    // The whole reason dayLogs exists: a later profile edit must not re-read history.
    expect(loaded.dayLog?.targets.kcal).toBe(2310);
  });

  it('returns only the asked-for profile and date', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'm2', date: '2026-09-18' }), logFor('p1', '2026-09-18'));
    await addEntry(entry({ id: 'm3', profileId: 'p2' }), logFor('p2', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries.map((e) => e.id)).toEqual(['m1']);
  });

  it('returns a null day log for a day with no entries', async () => {
    expect(await loadDay('p1', '2026-01-01')).toEqual({ entries: [], dayLog: null });
  });

  it('orders a day\'s entries by when they were added', async () => {
    await addEntry(entry({ id: 'later', createdAt: 20 }), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'earlier', createdAt: 10 }), logFor('p1', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('lists every entry across every profile and day', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'm2', profileId: 'p2', date: '2026-08-01' }), logFor('p2', '2026-08-01'));

    expect((await listAllEntries()).map((e) => e.id).sort()).toEqual(['m1', 'm2']);
  });

  it('updates an entry in place', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await updateEntry(entry({ kind: 'weight', cookSessionId: 's1', grams: g(120) }));

    const [only] = (await loadDay('p1', '2026-09-19')).entries;
    expect(only.kind).toBe('weight');
  });

  it('deletes an entry and leaves the day log behind', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await deleteEntry('m1');

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toEqual([]);
    // The day was logged; emptying it does not un-log it, and re-adding must not
    // resnapshot against newer targets.
    expect(loaded.dayLog).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/storage/meals.test.ts`
Expected: FAIL — cannot resolve `./meals`.

- [ ] **Step 3: Write the implementation**

Create `src/storage/meals.ts`:

```ts
import { db } from './db';
import type { DayLog, IsoDate, MealEntry } from '../core/types';

/**
 * A natural key rather than a generated id, so the database itself enforces
 * one day log per profile-day. A generated id would let a race write two.
 */
export const dayLogId = (profileId: string, date: IsoDate): string => `${profileId}:${date}`;

/**
 * Every entry, for the derived remainders in `core/batch.ts`. A full scan: at
 * one household's rate this is order 1,500 rows a year, cheaper than the
 * bookkeeping to avoid it, and `loadKitchen` already reads both its tables
 * whole. The `cookSessionId` index is there so it can be narrowed to
 * `anyOf(sessionIds)` if measurement ever justifies it.
 */
export const listAllEntries = (): Promise<MealEntry[]> => db.mealEntries.toArray();

export const loadDay = async (
  profileId: string,
  date: IsoDate,
): Promise<{ entries: MealEntry[]; dayLog: DayLog | null }> => {
  const [entries, dayLog] = await Promise.all([
    db.mealEntries.where('[profileId+date]').equals([profileId, date]).toArray(),
    db.dayLogs.get(dayLogId(profileId, date)),
  ]);
  return { entries: entries.sort((a, b) => a.createdAt - b.createdAt), dayLog: dayLog ?? null };
};

/**
 * The day log is written in the same transaction as the entry, so a failure
 * cannot leave an entry with no targets to measure it against — and it is
 * written only if absent, because a day's targets are frozen at its first
 * entry and must survive every later one.
 */
export const addEntry = async (entry: MealEntry, snapshot: DayLog): Promise<void> => {
  await db.transaction('rw', db.mealEntries, db.dayLogs, async () => {
    if ((await db.dayLogs.get(snapshot.id)) === undefined) await db.dayLogs.add(snapshot);
    await db.mealEntries.add(entry);
  });
};

export const updateEntry = async (entry: MealEntry): Promise<void> => {
  await db.mealEntries.put(entry);
};

/**
 * The day log is deliberately left behind when the last entry goes. Deleting
 * it would let a re-added entry resnapshot against today's targets, which is
 * exactly the history rewrite the table exists to prevent.
 */
export const deleteEntry = async (id: string): Promise<void> => {
  await db.mealEntries.delete(id);
};
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/storage/meals.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/storage/meals.ts src/storage/meals.test.ts
git commit -m "feat: add meal entry and day log storage

addEntry writes the day log in the same transaction as the entry, and
only when absent. Both halves matter: the transaction means a failure
cannot leave an entry with no targets to measure it against, and the
absence check is what freezes a day's targets at its first entry.

deleteEntry deliberately leaves the day log behind. Removing it with the
last entry would let a re-added entry resnapshot against today's
targets, which is the history rewrite the table exists to prevent."
```

---
## Task 3: Entry-aware quantities in `core/batch.ts`

Still additive — nothing existing changes signature. Task 6 does the removal.

**Read this before starting.** A `weight` entry consumes an absolute number of grams. A
`portion` entry consumes a *relative* share: `cookedWeightG / portionCount`. So correcting
a cook's measured weight or its portion count changes how much the portion entries already
against it consume. The guard on such an edit therefore cannot compare the new weight
against a consumption figure computed at the old one, which is why `consumedFromSessionAt`
takes the weight and the count as parameters and `consumedFromSession` is the special case
at the session's current values.

**Files:**
- Modify: `src/core/batch.ts`
- Test: `src/core/batch.test.ts`

**Interfaces:**
- Consumes: `MealEntry` from Task 1; existing `portionWeightG`, `portionsToGrams`, `EPSILON`,
  `Validation`, `CookDraft`, `sessionsOf` from `core/batch.ts`.
- Produces:
  ```ts
  isSessionEntry(e: MealEntry): e is MealEntry & { cookSessionId: string }
  entrySessionGrams(entry: MealEntry, session: CookSession): Grams
  consumedFromSessionAt(session, entries, cookedWeightG: Grams, portionCount: number): Grams
  consumedFromSession(session: CookSession, entries: readonly MealEntry[]): Grams
  cookedRemainingG(session: CookSession, entries: readonly MealEntry[]): Grams
  validateCookEdit(session, entries, draft: CookDraft): Validation
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/core/batch.test.ts`. Use the file's existing session/batch fixture helpers if
it has them; otherwise these local ones:

```ts
import {
  consumedFromSession, consumedFromSessionAt, cookedRemainingG, entrySessionGrams,
  isSessionEntry, validateCookEdit,
} from './batch';
import type { MealEntry } from './types';

// 284g cooked in 4 portions = 71g per portion.
const cook = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284), cookedRemainingG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false, ...over,
});

const mealEntry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

describe('entrySessionGrams', () => {
  it('converts a portion entry through the session\'s portion weight', () => {
    expect(entrySessionGrams(mealEntry({ portions: 2 }), cook())).toBeCloseTo(142, 10);
  });

  it('takes a weight entry at face value', () => {
    const e = mealEntry({ kind: 'weight', cookSessionId: 's1', grams: g(50) });
    expect(entrySessionGrams(e, cook())).toBe(50);
  });

  it('reports zero for entries that consume nothing from a session', () => {
    const quick = mealEntry({ kind: 'quick', name: 'Teh tarik', kcal: 180 });
    const ing = mealEntry({ kind: 'ingredient', ingredientId: 'i1', method: 'boiled', cookedG: g(100) });
    expect(entrySessionGrams(quick, cook())).toBe(0);
    expect(entrySessionGrams(ing, cook())).toBe(0);
  });
});

describe('consumedFromSession', () => {
  it('ignores entries against a different session', () => {
    const entries = [mealEntry(), mealEntry({ id: 'm2', cookSessionId: 'other', portions: 4 })];
    expect(consumedFromSession(cook(), entries)).toBeCloseTo(71, 10);
  });

  it('adds portion and weight entries in the same currency', () => {
    const entries = [
      mealEntry({ portions: 1 }),
      mealEntry({ id: 'm2', kind: 'weight', cookSessionId: 's1', grams: g(50) }),
    ];
    expect(consumedFromSession(cook(), entries)).toBeCloseTo(121, 10);
  });

  it('recomputes portion entries at a hypothetical weight, and leaves weight entries alone', () => {
    const entries = [
      mealEntry({ portions: 1 }),
      mealEntry({ id: 'm2', kind: 'weight', cookSessionId: 's1', grams: g(50) }),
    ];
    // Halving the cook halves what "one portion" meant; the weighed 50g does not move.
    expect(consumedFromSessionAt(cook(), entries, g(142), 4)).toBeCloseTo(85.5, 10);
  });
});

describe('cookedRemainingG', () => {
  it('is the whole cook when nothing has been eaten', () => {
    expect(cookedRemainingG(cook(), [])).toBe(284);
  });

  it('subtracts what the entries took', () => {
    expect(cookedRemainingG(cook(), [mealEntry({ portions: 2 })])).toBeCloseTo(142, 10);
  });

  it('clamps at zero rather than reporting a negative remainder', () => {
    const entries = [mealEntry({ kind: 'weight', cookSessionId: 's1', grams: g(400) })];
    expect(cookedRemainingG(cook(), entries)).toBe(0);
  });

  it('restores the remainder exactly when an entry is removed', () => {
    const entries = [mealEntry({ portions: 1 }), mealEntry({ id: 'm2', portions: 1 })];
    const afterDelete = entries.filter((e) => e.id !== 'm2');
    expect(cookedRemainingG(cook(), afterDelete)).toBeCloseTo(213, 10);
  });
});

describe('validateCookEdit', () => {
  const draft = (over: Partial<CookDraft> = {}): CookDraft => ({
    method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
    portionCount: 4, cookedAt: '2026-09-19', ...over,
  });

  it('allows a correction that still covers what was eaten', () => {
    const entries = [mealEntry({ kind: 'weight', cookSessionId: 's1', grams: g(100) })];
    expect(validateCookEdit(cook(), entries, draft({ cookedWeightG: g(150) })).ok).toBe(true);
  });

  it('refuses a weight below what has already been eaten, and names the grams', () => {
    const entries = [mealEntry({ kind: 'weight', cookSessionId: 's1', grams: g(200) })];
    const result = validateCookEdit(cook(), entries, draft({ cookedWeightG: g(150) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('200g');
  });

  it('allows shrinking a cook eaten only in portions, because portions shrink with it', () => {
    // Two of four portions eaten is half the pan at any weight.
    const entries = [mealEntry({ portions: 2 })];
    expect(validateCookEdit(cook(), entries, draft({ cookedWeightG: g(20) })).ok).toBe(true);
  });

  it('refuses a portion count that would make the eaten portions exceed the cook', () => {
    // Three portions eaten out of four; recut to two and those three are 1.5 pans.
    const entries = [mealEntry({ portions: 3 })];
    expect(validateCookEdit(cook(), entries, draft({ portionCount: 2 })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/core/batch.test.ts`
Expected: FAIL — the new functions are not exported.

- [ ] **Step 3: Implement**

Add to `src/core/batch.ts` (imports first: add `MealEntry` to the existing type import from
`./types`). Place these after `portionsToGrams`, which they use.

```ts
/**
 * `ingredient` and `quick` entries reference no cook session and so consume
 * nothing from one. Narrowing on the kinds rather than on the presence of the
 * field keeps the check tied to the union rather than to a property name.
 */
export const isSessionEntry = (e: MealEntry): e is MealEntry & { cookSessionId: string } =>
  e.kind === 'portion' || e.kind === 'weight';

/**
 * How much of a session one entry consumes.
 *
 * Zero for the kinds that consume nothing, so callers can reduce over a mixed
 * day without filtering first. Note the asymmetry it hides: a `weight` entry is
 * absolute, a `portion` entry is a share of a weight that can later be
 * corrected. `consumedFromSessionAt` is where that matters.
 */
export function entrySessionGrams(entry: MealEntry, session: CookSession): Grams {
  switch (entry.kind) {
    case 'portion': return portionsToGrams(session, entry.portions);
    case 'weight': return entry.grams;
    default: return g(0);
  }
}

/**
 * What a session would have lost if it had been weighed at `cookedWeightG` and
 * cut into `portionCount`.
 *
 * Portion entries are recomputed at the hypothetical values and weight entries
 * are not, because that is what the two kinds mean: "one container" follows the
 * pan, "180g on the scale" does not. Correcting a cook is the only caller that
 * needs the distinction, and it is the caller that would be wrong without it.
 */
export function consumedFromSessionAt(
  session: CookSession,
  entries: readonly MealEntry[],
  cookedWeightG: Grams,
  portionCount: number,
): Grams {
  const mine = entries.filter((e) => isSessionEntry(e) && e.cookSessionId === session.id);
  const weighed = mine.reduce((sum, e) => sum + (e.kind === 'weight' ? e.grams : 0), 0);
  const portions = mine.reduce((sum, e) => sum + (e.kind === 'portion' ? e.portions : 0), 0);
  if (portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${portionCount}`);
  }
  return g(weighed + (cookedWeightG / portionCount) * portions);
}

export const consumedFromSession = (
  session: CookSession,
  entries: readonly MealEntry[],
): Grams => consumedFromSessionAt(session, entries, session.cookedWeightG, session.portionCount);

/**
 * Derived, not stored. Phase 2 stored it because eating wrote no record;
 * meals are now that record, so the execution record's own rule applies —
 * derive what has an event log. Deleting an entry restores the remainder with
 * no compensating write, and there is no second number left to drift.
 */
export function cookedRemainingG(session: CookSession, entries: readonly MealEntry[]): Grams {
  return g(Math.max(0, session.cookedWeightG - consumedFromSession(session, entries)));
}

/**
 * A cook may be corrected in any way that still accounts for what has been
 * eaten out of it.
 *
 * Under a stored remainder this case was `rescaleCookedRemaining`'s job, which
 * preserved the fraction eaten. Under derivation the entries are fixed events
 * and it is the remainder that moves, so the same correction can drive it
 * negative — the guard moves to the edit rather than disappearing with the field.
 */
export function validateCookEdit(
  session: CookSession,
  entries: readonly MealEntry[],
  draft: CookDraft,
): Validation {
  const consumed = consumedFromSessionAt(session, entries, draft.cookedWeightG, draft.portionCount);
  if (consumed > draft.cookedWeightG + EPSILON) {
    return no(
      `${formatG(consumed)} of this cook has already been eaten, so it cannot ` +
      `come to less than that.`,
    );
  }
  return ok;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/core/batch.test.ts`
Expected: PASS, including every pre-existing test in the file unchanged.

- [ ] **Step 5: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/core/batch.ts src/core/batch.test.ts
git commit -m "feat: derive a cook's remainder from meal entries

Additive: the stored field is still there and still authoritative until
the next task removes it.

consumedFromSessionAt takes the cooked weight and portion count as
parameters rather than reading them off the session, because a portion
entry is a share of the pan and a weight entry is not. Correcting a cook
to 150g when 200g was weighed out of it must be refused; correcting it
to 20g when two of four portions were eaten must be allowed, since two
of four portions is half the pan at any weight. A guard comparing
against consumption computed at the old values gets both wrong.

That case used to be rescaleCookedRemaining's, which preserved the
fraction eaten. With entries as fixed events it is the remainder that
moves instead, so the guard moves to the edit."
```

---

## Task 4: `core/meals.ts` — what an entry is worth

**Files:**
- Create: `src/core/meals.ts`
- Create: `src/core/meals.test.ts`
- Modify: `src/core/targets.ts` (add `snapshotTargets`)
- Test: `src/core/targets.test.ts`

**Interfaces:**
- Consumes: `entrySessionGrams`, `cookedRemainingG`, `consumedFromSession` from Task 3;
  `computeRaw`, `computeCooked`, `rawFromCooked` from `core/nutrition.ts`; `retentionFor`
  from `core/retention.ts`; `zeroNutrients`, `mapNutrients`, `scaleNutrients`, `addNutrients`
  from `core/nutrients.ts`.
- Produces:
  ```ts
  interface MealContext {
    sessions: readonly CookSession[];
    batches: readonly Batch[];
    ingredientById: (id: string) => Ingredient | undefined;
    samples: readonly YieldSample[];
    categoryYield: CategoryYield;
    retention: RetentionLookup;
  }
  sessionRetainedNutrients(session, ingredient, retention): NutrientProfile
  entryNutrients(entry: MealEntry, ctx: MealContext): NutrientProfile
  interface DayTotals { totals: NutrientProfile; unknownMicroEntries: number; unknownProteinEntries: number }
  dayTotals(entries: readonly MealEntry[], ctx: MealContext): DayTotals
  validateEntry(draft: MealEntryFields, ctx: MealContext, entries: readonly MealEntry[], editingId: string | null): Validation
  ```
  And from `core/targets.ts`: `snapshotTargets(profile, today, rniLookup, dvTable): DayLogTargets`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/meals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dayTotals, entryNutrients, sessionRetainedNutrients, validateEntry, type MealContext } from './meals';
import type { Batch, CookSession, Ingredient, MealEntry, MealEntryFields } from './types';
import { g } from './units';
import { zeroNutrients } from './nutrients';

const chicken: Ingredient = {
  id: 'chicken', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5, potassium: 334, iron: 0.7 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false, source: 'usda', archived: false,
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken', rawWeightG: g(1000),
  purchase: { pricePaidMYR: 20 as never, location: 'Jaya Grocer', date: '2026-09-18' },
  createdAt: 1,
};

// 400g raw roasted to 284g, cut into 4 portions of 71g.
const session: CookSession = {
  id: 's1', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284), cookedRemainingG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
};

// protein retention 0.98 for meat/roasted; everything else falls through to 1.
const RETENTION = { meat: { roasted: { protein: 0.98, potassium: 0.85 } } };
const CATEGORY_YIELD = { meat: { roasted: 0.71, boiled: 0.7, steamed: 0.75, panFried: 0.72,
  stirFried: 0.73, deepFried: 0.74, grilled: 0.71 } } as never;

const ctx: MealContext = {
  sessions: [session], batches: [batch],
  ingredientById: (id) => (id === 'chicken' ? chicken : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION as never,
};

const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

describe('sessionRetainedNutrients', () => {
  it('applies retention to the raw weight and never a yield factor', () => {
    const r = sessionRetainedNutrients(session, chicken, RETENTION as never);
    // 400g raw = 90g protein; × 0.98 retention = 88.2g. The 0.71 yield is NOT applied:
    // cooking moves water, not protein. See execution record §3.8.
    expect(r.protein).toBeCloseTo(88.2, 6);
    expect(r.potassium).toBeCloseTo(400 / 100 * 334 * 0.85, 6);
  });
});

describe('entryNutrients', () => {
  it('gives a portion its share of the pan, scaled by cooked weight', () => {
    // One of four portions = 71g of 284g = a quarter of 88.2g protein.
    expect(entryNutrients(entry(), ctx).protein).toBeCloseTo(22.05, 6);
  });

  it('scales a weighed amount by the same denominator', () => {
    const e = entry({ kind: 'weight', cookSessionId: 's1', grams: g(142) });
    expect(entryNutrients(e, ctx).protein).toBeCloseTo(44.1, 6);
  });

  it('computes an ingredient entry through the calculator\'s own path', () => {
    const e = entry({ kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) });
    // 142g cooked ÷ 0.71 published yield = 200g raw = 45g protein × 0.98 = 44.1g.
    expect(entryNutrients(e, ctx).protein).toBeCloseTo(44.1, 6);
  });

  it('gives a quick entry its calories and protein and nothing else', () => {
    const e = entry({ kind: 'quick', name: 'Teh tarik', kcal: 180, proteinG: 4 });
    const n = entryNutrients(e, ctx);
    expect(n.kcal).toBe(180);
    expect(n.protein).toBe(4);
    expect(n.iron).toBe(0);
  });

  it('returns zeroes rather than throwing when a session cannot be resolved', () => {
    const e = entry({ cookSessionId: 'gone' });
    expect(entryNutrients(e, ctx)).toEqual(zeroNutrients());
  });
});

describe('dayTotals', () => {
  it('adds the entries up', () => {
    const t = dayTotals([entry(), entry({ id: 'm2', portions: 1 })], ctx);
    expect(t.totals.protein).toBeCloseTo(44.1, 6);
    expect(t.unknownMicroEntries).toBe(0);
    expect(t.unknownProteinEntries).toBe(0);
  });

  it('counts a quick entry as unknown micronutrients', () => {
    const t = dayTotals([entry(), entry({ id: 'm2', kind: 'quick', name: 'Nasi lemak', kcal: 640, proteinG: 12 })], ctx);
    expect(t.unknownMicroEntries).toBe(1);
    // Protein was given, so protein is still exact.
    expect(t.unknownProteinEntries).toBe(0);
  });

  it('counts a quick entry with no protein figure separately', () => {
    const t = dayTotals([entry({ kind: 'quick', name: 'Kuih', kcal: 200 })], ctx);
    expect(t.unknownMicroEntries).toBe(1);
    expect(t.unknownProteinEntries).toBe(1);
  });

  it('reports an empty day as zeroes with nothing unknown', () => {
    expect(dayTotals([], ctx)).toEqual({
      totals: zeroNutrients(), unknownMicroEntries: 0, unknownProteinEntries: 0,
    });
  });
});

describe('validateEntry', () => {
  const draft = (over: Partial<MealEntryFields> = {}): MealEntryFields =>
    ({ kind: 'weight', cookSessionId: 's1', grams: g(100), ...over } as MealEntryFields);

  it('accepts an amount that fits in what is left', () => {
    expect(validateEntry(draft(), ctx, [], null).ok).toBe(true);
  });

  it('refuses more than remains, naming the remainder', () => {
    const result = validateEntry(draft({ kind: 'weight', cookSessionId: 's1', grams: g(300) }), ctx, [], null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('284g');
  });

  it('counts existing entries against the remainder', () => {
    const existing = [entry({ kind: 'weight', cookSessionId: 's1', grams: g(250) })];
    expect(validateEntry(draft(), ctx, existing, null).ok).toBe(false);
  });

  it('excludes the entry being edited from the remainder it is checked against', () => {
    const existing = [entry({ id: 'm1', kind: 'weight', cookSessionId: 's1', grams: g(250) })];
    // Growing 250g to 260g must be allowed: without excluding itself, 260 is compared
    // against the 34g left after its own 250g and is wrongly refused.
    const bigger = draft({ kind: 'weight', cookSessionId: 's1', grams: g(260) });
    expect(validateEntry(bigger, ctx, existing, 'm1').ok).toBe(true);
  });

  it('refuses a quick entry with no calories', () => {
    expect(validateEntry(draft({ kind: 'quick', name: 'Something', kcal: 0 }), ctx, [], null).ok).toBe(false);
  });

  it('refuses a quick entry with no name', () => {
    expect(validateEntry(draft({ kind: 'quick', name: '  ', kcal: 100 }), ctx, [], null).ok).toBe(false);
  });

  it('refuses an ingredient entry with no weight', () => {
    const d = draft({ kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(0) });
    expect(validateEntry(d, ctx, [], null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/core/meals.test.ts`
Expected: FAIL — cannot resolve `./meals`.

- [ ] **Step 3: Implement `core/meals.ts`**

```ts
import { consumedFromSessionAt, entrySessionGrams, EPSILON, type Validation } from './batch';
import { addNutrients, mapNutrients, scaleNutrients, zeroNutrients } from './nutrients';
import { computeCooked, computeRaw, rawFromCooked } from './nutrition';
import { retentionFor, type RetentionLookup } from './retention';
import type {
  Batch, CookSession, Ingredient, MealEntry, MealEntryFields, NutrientProfile, YieldSample,
} from './types';
import { formatG, g } from './units';
import type { CategoryYield } from './yieldResolver';

/**
 * Everything needed to resolve an entry to nutrients, passed in rather than
 * imported: `core/` may not reach into `data/` (`purity.test.ts` enforces it),
 * which is the same reason `computeCooked` takes its tables as arguments.
 */
export interface MealContext {
  sessions: readonly CookSession[];
  /** A session reaches its ingredient through its batch. */
  batches: readonly Batch[];
  ingredientById: (id: string) => Ingredient | undefined;
  /** `ingredient` entries inherit calibration from the user's own cooks. */
  samples: readonly YieldSample[];
  categoryYield: CategoryYield;
  retention: RetentionLookup;
}

const ok: Validation = { ok: true };
const no = (message: string): Validation => ({ ok: false, message });

/**
 * The nutrients in a whole cook, after leaching and before anything is eaten.
 *
 * Deliberately NOT `computeCooked`. That would re-derive the cooked weight from
 * a yield factor when the user has already weighed the pan. Cooking moves water,
 * not nutrients: the measured `cookedWeightG` sets the concentration, so it
 * belongs in the denominator of `entryNutrients` and never as a factor here.
 * Only retention removes anything. See execution record §3.8 and the identical
 * rule in `proteinPerMYRRetained`.
 *
 * Do not "fix" this by routing it through `computeCooked`.
 */
export function sessionRetainedNutrients(
  session: CookSession,
  ingredient: Ingredient,
  retention: RetentionLookup,
): NutrientProfile {
  const raw = computeRaw(ingredient, session.rawUsedG).totals;
  return mapNutrients(raw, (value, key) =>
    value * retentionFor(retention, ingredient.category, session.method, key).factor);
}

const ingredientForSession = (
  session: CookSession,
  ctx: MealContext,
): Ingredient | undefined => {
  const batch = ctx.batches.find((b) => b.id === session.batchId);
  return batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId);
};

/**
 * Total, never throwing: an entry whose session, batch or ingredient cannot be
 * resolved contributes zero rather than taking the day's totals down with it.
 * Deletion cascades, so this should be unreachable — but it is the landing
 * screen's arithmetic, and a thrown error there costs the user the whole day.
 */
export function entryNutrients(entry: MealEntry, ctx: MealContext): NutrientProfile {
  if (entry.kind === 'quick') {
    return { ...zeroNutrients(), kcal: entry.kcal, protein: entry.proteinG ?? 0 };
  }

  if (entry.kind === 'ingredient') {
    const ingredient = ctx.ingredientById(entry.ingredientId);
    if (ingredient === undefined || entry.cookedG <= 0) return zeroNutrients();
    const { rawWeightG } = rawFromCooked(
      ingredient, entry.cookedG, entry.method, ctx.samples, ctx.categoryYield,
    );
    return computeCooked({
      ingredient, rawG: rawWeightG, method: entry.method,
      samples: ctx.samples, categoryYield: ctx.categoryYield, retention: ctx.retention,
    }).totals;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined || session.cookedWeightG <= 0) return zeroNutrients();
  const ingredient = ingredientForSession(session, ctx);
  if (ingredient === undefined) return zeroNutrients();

  const retained = sessionRetainedNutrients(session, ingredient, ctx.retention);
  return scaleNutrients(retained, entrySessionGrams(entry, session) / session.cookedWeightG);
}

export interface DayTotals {
  totals: NutrientProfile;
  /** Entries contributing no micronutrient figures — always `quick` ones. */
  unknownMicroEntries: number;
  /** Quick entries whose `proteinG` was left blank. */
  unknownProteinEntries: number;
}

/**
 * The two counts are separate rather than one "incomplete" flag because
 * calories, protein and micronutrients degrade independently: a `quick` entry
 * always carries calories, usually carries protein, and never carries
 * micronutrients. Collapsing them would put an "at least" on a figure that is
 * exact.
 */
export function dayTotals(entries: readonly MealEntry[], ctx: MealContext): DayTotals {
  let totals = zeroNutrients();
  let unknownMicroEntries = 0;
  let unknownProteinEntries = 0;

  for (const entry of entries) {
    totals = addNutrients(totals, entryNutrients(entry, ctx));
    if (entry.kind === 'quick') {
      unknownMicroEntries += 1;
      if (entry.proteinG === undefined) unknownProteinEntries += 1;
    }
  }

  return { totals, unknownMicroEntries, unknownProteinEntries };
}

/**
 * `editingId` is required, not optional, because forgetting it produces a bug
 * that reads as correct code: growing an entry from 150g to 160g would compare
 * 160 against a remainder that already has its own 150 subtracted, and refuse a
 * valid edit. `null` means the draft is new.
 */
export function validateEntry(
  draft: MealEntryFields,
  ctx: MealContext,
  entries: readonly MealEntry[],
  editingId: string | null,
): Validation {
  if (draft.kind === 'quick') {
    if (draft.name.trim() === '') return no('Give this a name so you can recognise it later.');
    if (!Number.isFinite(draft.kcal) || draft.kcal <= 0) return no('Enter roughly how many calories it was.');
    if (draft.proteinG !== undefined && (!Number.isFinite(draft.proteinG) || draft.proteinG < 0)) {
      return no('Protein cannot be negative. Leave it blank if you do not know.');
    }
    return ok;
  }

  if (draft.kind === 'ingredient') {
    if (ctx.ingredientById(draft.ingredientId) === undefined) return no('Choose an ingredient.');
    if (draft.cookedG <= 0) return no('Enter how much you ate.');
    return ok;
  }

  const session = ctx.sessions.find((s) => s.id === draft.cookSessionId);
  if (session === undefined) return no('That cook is no longer in your kitchen.');

  if (draft.kind === 'portion' && (!Number.isFinite(draft.portions) || draft.portions <= 0)) {
    return no('Enter how many portions you ate.');
  }
  if (draft.kind === 'weight' && draft.grams <= 0) return no('Enter how much you ate.');

  // Everything except the entry being edited, so growing an entry is measured
  // against the room its own current value occupies.
  const others = entries.filter((e) => e.id !== editingId);
  const consumed = consumedFromSessionAt(
    session, others, session.cookedWeightG, session.portionCount,
  );
  const remaining = g(Math.max(0, session.cookedWeightG - consumed));

  const wanted = draft.kind === 'weight'
    ? draft.grams
    : g((session.cookedWeightG / session.portionCount) * draft.portions);

  if (wanted > remaining + EPSILON) {
    const portionsLeft = remaining / (session.cookedWeightG / session.portionCount);
    return no(`Only ${formatG(remaining)} is left — about ${portionsLeft.toFixed(1)} portions.`);
  }

  return ok;
}
```

- [ ] **Step 4: Add `snapshotTargets` to `core/targets.ts`**

```ts
/**
 * The targets to freeze into a `DayLog` when a day's first entry is written.
 * Assembled here rather than in the UI so the three figures cannot be gathered
 * inconsistently by different callers.
 */
export function snapshotTargets(
  profile: Profile,
  today: Date,
  rniLookup: RniLookup,
  dvTable: Partial<Record<NutrientKey, number>>,
): DayLogTargets {
  return {
    kcal: calorieTarget(profile, today),
    proteinG: proteinTargetG(profile),
    micros: microTargets(profile, today, rniLookup, dvTable),
  };
}
```

And a test in `src/core/targets.test.ts`:

```ts
describe('snapshotTargets', () => {
  it('gathers the three figures a day is measured against', () => {
    const snap = snapshotTargets(profile, new Date(2026, 8, 19), rniFor, DV_US);
    expect(snap.kcal).toBeCloseTo(calorieTarget(profile, new Date(2026, 8, 19)), 10);
    expect(snap.proteinG).toBeCloseTo(proteinTargetG(profile), 10);
    expect(snap.micros.iron).toBeDefined();
  });
});
```

If `targets.test.ts` does not already import `rniFor` and `DV_US`, add those imports — the
test file is allowed to reach into `data/`; only `src/core/*.ts` source files are not.

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/core/meals.test.ts src/core/targets.test.ts src/core/purity.test.ts`
Expected: PASS. The purity test matters here: if `meals.ts` imported `../data/`, it fails.

- [ ] **Step 6: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/core/meals.ts src/core/meals.test.ts src/core/targets.ts src/core/targets.test.ts
git commit -m "feat: work out what a meal entry is worth

sessionRetainedNutrients deliberately does not call computeCooked. That
would re-derive the cooked weight from a yield factor when the user has
already weighed the pan. Cooking moves water, not nutrients: the
measured cookedWeightG sets the concentration, so it belongs in
entryNutrients' denominator and never as a factor on the mass. Same rule
as proteinPerMYRRetained, execution record §3.8.

entryNutrients is total and never throws. An entry whose session cannot
be resolved contributes zero instead of taking the day down with it —
deletion cascades so it should be unreachable, but this is the landing
screen's arithmetic.

dayTotals returns two unknown-counts rather than one incomplete flag,
because a quick entry always carries calories, usually carries protein
and never carries micronutrients. One flag would put an 'at least' on a
figure that is exact.

validateEntry takes editingId as a required parameter. Optional, the
forgotten case reads as correct code and refuses a valid edit."
```

---
## Task 5: Thread meal entries through the kitchen's storage

Still additive. This lays the plumbing so Task 6 only has to flip the reads.

**Files:**
- Modify: `src/storage/kitchen.ts`
- Modify: `src/ui/useKitchen.ts`
- Test: `src/storage/kitchen.test.ts`
- Test: `src/ui/useKitchen.test.ts`

**Interfaces:**
- Consumes: `listAllEntries` from Task 2.
- Produces: `loadKitchen(): Promise<{ batches; sessions; entries }>`; `Kitchen.entries` on the
  `useKitchen` return value; `deleteBatchCascade` covering `mealEntries`.

- [ ] **Step 1: Write the failing tests**

Add to `src/storage/kitchen.test.ts`:

```ts
import { db } from './db';
import { addEntry, dayLogId } from './meals';

describe('deleting a batch', () => {
  it('takes its cooks and the meals logged against them', async () => {
    await db.batches.put(batch);            // reuse the file's existing fixtures
    await db.cookSessions.put(session);
    await addEntry(
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: session.id, portions: 1 },
      { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19',
        targets: { kcal: 2000, proteinG: 150, micros: {} } },
    );

    await deleteBatchCascade(batch.id);

    expect(await db.cookSessions.toArray()).toEqual([]);
    // An entry pointing at a deleted session resolves to no nutrients and sits in
    // the day contributing nothing while still being listed.
    expect(await db.mealEntries.toArray()).toEqual([]);
    // The day log is not a child of the batch and stays.
    expect(await db.dayLogs.toArray()).toHaveLength(1);
  });
});

describe('loadKitchen', () => {
  it('returns meal entries alongside batches and sessions', async () => {
    const loaded = await loadKitchen();
    expect(loaded).toHaveProperty('entries');
    expect(Array.isArray(loaded.entries)).toBe(true);
  });
});
```

Add to `src/ui/useKitchen.test.ts` a case asserting `result.current.entries` is populated
from storage, following whatever shape the file's existing `renderHook` tests use.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/storage/kitchen.test.ts src/ui/useKitchen.test.ts`
Expected: FAIL — `entries` is undefined; the meal entry survives the cascade.

- [ ] **Step 3: Implement**

In `src/storage/kitchen.ts`:

```ts
import { listAllEntries } from './meals';
import type { Batch, CookSession, MealEntry } from '../core/types';

/**
 * Three tables in one call. Every derived quantity in `core/batch.ts` now needs
 * a batch, its sessions AND the meal entries against them, because the cooked
 * remainder stopped being a stored field.
 */
export const loadKitchen = async (): Promise<{
  batches: Batch[]; sessions: CookSession[]; entries: MealEntry[];
}> => {
  const [batches, sessions, entries] = await Promise.all([
    listBatches(), listCookSessions(), listAllEntries(),
  ]);
  return { batches, sessions, entries };
};
```

Extend the cascade. Note the two-step lookup: entries reference sessions, not batches.

```ts
/**
 * Deleting a batch must take its sessions AND the meals logged against them.
 * A surviving session is an orphan that `toYieldSamples` silently skips; a
 * surviving entry resolves to no nutrients and sits in a day contributing
 * nothing while still being listed.
 *
 * One transaction, so a failure cannot leave part of it done. The day log is
 * not a child of the batch and is left alone.
 */
export const deleteBatchCascade = async (batchId: string): Promise<void> => {
  await db.transaction('rw', db.batches, db.cookSessions, db.mealEntries, async () => {
    const sessionIds = (await db.cookSessions.where('batchId').equals(batchId).primaryKeys());
    await db.mealEntries.where('cookSessionId').anyOf(sessionIds).delete();
    await db.cookSessions.where('batchId').equals(batchId).delete();
    await db.batches.delete(batchId);
  });
};
```

`deleteCookSession` needs the same treatment, for the same reason:

```ts
export const deleteCookSession = async (id: string): Promise<void> => {
  await db.transaction('rw', db.cookSessions, db.mealEntries, async () => {
    await db.mealEntries.where('cookSessionId').equals(id).delete();
    await db.cookSessions.delete(id);
  });
};
```

In `src/ui/useKitchen.ts`, add `entries` to the `Kitchen` interface, to the state, and to
the `fetchAll` assignment and the return value. Follow the existing generation-counter
pattern exactly — do not introduce a second one.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/storage src/ui/useKitchen.test.ts`

- [ ] **Step 5: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/storage/kitchen.ts src/storage/kitchen.test.ts src/ui/useKitchen.ts src/ui/useKitchen.test.ts
git commit -m "feat: load meal entries with the kitchen and cascade deletes to them

Every derived quantity in core/batch.ts now needs the entries too, so
loadKitchen returns all three tables together for the same reason it
already returned two.

Deleting a batch or a cook now removes the meals logged against it, in
the same transaction. A surviving entry would resolve to no nutrients
and sit in the day contributing nothing while still being listed —
the same class of defect as the orphaned session the batch cascade
already existed to prevent. The day log is not a child of a batch and
is left alone."
```

---

## Task 6: The flip — remove the stored remainder

The one task that cannot be split. Removing `cookedRemainingG` from the type breaks every
reader at once, which is the point: the compiler finds them all.

**Files:**
- Modify: `src/core/types.ts` (remove the field)
- Modify: `src/core/batch.ts` (remove the eat machinery; entry-aware `portionsRemaining`, `batchState`)
- Modify: `src/core/batch.test.ts`
- Modify: `src/ui/components/SessionRow.tsx`, `src/ui/components/SessionRow.test.tsx`
- Modify: `src/ui/components/BatchCard.tsx`, `src/ui/components/BatchCard.test.tsx`
- Modify: `src/ui/components/CookSessionForm.tsx`, `src/ui/components/CookSessionForm.test.tsx`
- Modify: `src/ui/screens/KitchenScreen.tsx`, `src/ui/screens/KitchenScreen.test.tsx`
- Modify: `src/core/meals.test.ts` (its `session` fixture carries the field — added in Task 4)
- Modify: `src/storage/kitchen.test.ts`, `src/storage/migration.test.ts` (fixtures)
- Delete: `src/ui/components/EatControl.tsx`, `src/ui/components/EatControl.test.tsx`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: `portionsRemaining(session, entries)`, `batchState(batch, sessions, entries)`.
  Gone: `CookSession.cookedRemainingG`, `applyEat`, `validateEat`, `rescaleCookedRemaining`.
  **`portionsToGrams` stays** — `entrySessionGrams` calls it, and reimplementing the
  portions-are-a-view-over-grams rule in a second place is how the two drift.

- [ ] **Step 1: Change the signatures and delete the field**

In `src/core/types.ts`, delete `cookedRemainingG` from `CookSession` and replace the
doc comment above the interface:

```ts
/**
 * One cooking event, and simultaneously one yield observation.
 *
 * There is deliberately no `cookedRemainingG` field. Meal entries are an event
 * log of consumption, so the remainder is always recoverable from them —
 * storing it too would be a second source of truth that editing could put out
 * of step. Phase 2 did store it, correctly, because eating wrote no record
 * then. See `cookedRemainingG()` in `./batch`.
 */
```

In `src/core/batch.ts`:

```ts
export function batchState(
  batch: Batch,
  sessions: readonly CookSession[],
  entries: readonly MealEntry[],
): BatchState {
  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return 'raw';
  if (rawRemainingG(batch, sessions) > EPSILON) return 'partiallyCooked';
  const left = g(mine.reduce((sum, s) => sum + cookedRemainingG(s, entries), 0));
  return left > EPSILON ? 'cooked' : 'finished';
}

/**
 * Derived from grams, not counted down. Eating a weighed 100g out of a 148g
 * portion has to mean something, and "0.68 portions gone" is the only answer
 * consistent with the grams actually leaving the container.
 */
export function portionsRemaining(
  session: CookSession,
  entries: readonly MealEntry[],
): number {
  if (session.cookedWeightG <= 0) return 0;
  return cookedRemainingG(session, entries) / portionWeightG(session);
}
```

Delete `validateEat`, `applyEat` and `rescaleCookedRemaining` entirely.

- [ ] **Step 2: Run the build and let it list the call sites**

Run: `npm run build`
Expected: FAIL, with one error per reader. Work through the list; do not guess at it.
Expect roughly: `EatControl.tsx`, `SessionRow.tsx`, `BatchCard.tsx`, `CookSessionForm.tsx`,
`KitchenScreen.tsx`, and every test fixture that builds a `CookSession` literal.

- [ ] **Step 3: Delete EatControl**

```bash
git rm src/ui/components/EatControl.tsx src/ui/components/EatControl.test.tsx
```

Consumption moves to Log (spec §2). Nothing replaces it in Kitchen.

- [ ] **Step 4: Update `SessionRow`**

Add `entries: readonly MealEntry[]` to `Props`. Remove the `EatControl` import and its
element. Replace the two `session.cookedRemainingG` reads and add the remaining line
`EatControl` used to render:

```tsx
  const remaining = cookedRemainingG(session, entries);
  const portionsLeft = portionsRemaining(session, entries);
```
```tsx
      <p className="session__remaining" data-testid="remaining">
        {remaining <= 0
          ? 'All eaten'
          : `${formatG(remaining)} left · ${portionsLeft.toFixed(1)} portions`}
      </p>
```

And in the delete confirmation, `{formatG(session.cookedRemainingG)}` becomes
`{formatG(remaining)}`.

Keep the `data-testid="remaining"` so the existing assertions that moved here still find it.

`src/index.css` has a `.eat__remaining` rule, named after the component being deleted.
Rename it to `.session__remaining` in the same commit — leaving it would be a dangling rule
for a class nothing uses, and adding the new one in Task 17 would leave the line unstyled
in between.

- [ ] **Step 5: Update `BatchCard`**

Add `entries: readonly MealEntry[]` to `Props`. Line 39 becomes:

```tsx
  const cookedLeft = g(mine.reduce((sum, s) => sum + cookedRemainingG(s, entries), 0));
```

Keep the `g(...)` wrap — execution record §2 is exactly this line losing its brand. Pass
`entries` down to each `SessionRow`.

- [ ] **Step 6: Update `CookSessionForm`**

Remove the `rescaleCookedRemaining` call from the object literal it builds when editing.
The saved session simply has no remainder field any more. **Take care in that literal:
`excludeFromCalibration` sits beside the line you are deleting and must survive** — there
is a test pinning it, added in the Phase 2 fix wave for this exact reason.

Add `entries: readonly MealEntry[]` to `Props`, and call the new guard alongside the
existing `validateCook`:

```tsx
    const check = validateCook(batch, sessions, draft, ingredient, CATEGORY_YIELD);
    if (!check.ok) { setError(check.message); return; }

    // Editing only: a correction must still account for what has been eaten.
    if (session !== undefined) {
      const editCheck = validateCookEdit(session, entries, draft);
      if (!editCheck.ok) { setError(editCheck.message); return; }
    }
```

Add a test:

```tsx
  it('refuses a corrected cooked weight below what has already been eaten', async () => {
    // 284g cook, 200g logged as eaten; correcting it to 150g must be refused.
    render(<CookSessionForm {...props} session={session} entries={[weightEntry200g]} />);
    await user.clear(screen.getByLabelText(/cooked weight/i));
    await user.type(screen.getByLabelText(/cooked weight/i), '150');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('200g');
    expect(onSaved).not.toHaveBeenCalled();
  });
```

Match the real label and button text in the component — do not trust the regexes above
without checking.

- [ ] **Step 7: Update `KitchenScreen`**

Take `entries` from `useKitchen`, pass it to `batchState` in the `grouped` memo (and add it
to that memo's dependency array), and pass it to every `BatchCard` and `CookSessionForm`.

- [ ] **Step 8: Fix every test fixture**

Remove `cookedRemainingG` from every `CookSession` literal in the test files the build
named. **This includes the fixtures Tasks 3 and 4 added** — `batch.test.ts`'s `cook()` and
`meals.test.ts`'s `session` both set it, because the field still existed when they were
written. Where a test previously set up a partly eaten cook by lowering that field, set it up
by passing meal entries instead — that is the behaviour under test now.

- [ ] **Step 9: Run the three commands**

```bash
npm test && npm run build && npm run lint
```
Expected: all pass. The test count drops by however many `EatControl.test.tsx` held; that
is correct. Everything else must still pass, including the golden suite.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat!: derive the cooked remainder instead of storing it

Removes CookSession.cookedRemainingG, applyEat, validateEat and
rescaleCookedRemaining, and deletes EatControl. Kitchen no longer
records consumption; Log does.

Phase 2 stored the remainder for a good reason — eating wrote no record,
so there was no log to derive from. Meal entries are that log, so the
execution record's own rule applies: derive what has an event log, store
what does not. Deleting an entry now restores the remainder with no
compensating write, editing one is arithmetic rather than
reconciliation, and the two numbers can no longer drift because there is
only one.

It also dissolves the stale-snapshot race the execution record flagged
for this phase rather than fixing it. The proposed fix was field-scoped
update helpers plus a transaction, on the grounds that Phase 3 would
multiply the writers to that row. There are now no writers, because
there is no field.

portionsToGrams stays: entrySessionGrams calls it, and a second copy of
the portions-are-a-view-over-grams rule is how the two drift."
```

---

## Task 7: Calc stops writing

**Files:**
- Modify: `src/ui/screens/CalcScreen.tsx`
- Modify: `src/ui/screens/CalcScreen.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CalcScreen` with no write path. Its props are unchanged.

- [ ] **Step 1: Delete the flow**

Remove from `src/ui/screens/CalcScreen.tsx`:

- the `loggingBatch` and `loggedMessage` state
- the `AddBatchForm` import and the `loggingBatch && ingredient !== null` branch of the
  ternary at line 129
- the "Log this as a batch" button and its `btn-row`
- the `loggedMessage` banner
- `setLoggingBatch(false)` from `handleAddNew`, and any now-unused import

**Keep** the add-ingredient flow, `useKitchen`'s `samples` (calibration still feeds the
calculator) and the `kitchenError` banner.

The ternary at line 129 collapses to the two-branch form it had before Phase 2 added the
third. The dead end recorded in execution record §1.4 was a symptom of that third branch;
removing it is what actually fixes the class.

- [ ] **Step 2: Update the tests**

Delete the tests in `CalcScreen.test.tsx` that exercise logging a batch from the
calculator. Add one that pins the removal:

```tsx
  it('offers no way to write anything from the calculator', async () => {
    renderCalc();
    await pickIngredient('Chicken breast');
    await enterWeight(1000);

    expect(screen.queryByRole('button', { name: /log this as a batch/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /i bought this/i })).toBeNull();
  });
```

Keep every test covering the trace, the nutrient table, the method comparison, the portion
split and the add-ingredient flow.

- [ ] **Step 3: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/CalcScreen.tsx src/ui/screens/CalcScreen.test.tsx
git commit -m "feat!: remove the calculator's log-as-batch action

Calc computes and writes nothing. Kitchen and Log each own one kind of
write, which is the responsibility split this phase is organised around.

The action looked useful but was bridging two instances of the same
thing: Log's any-ingredient entry form is an ingredient picker, a weight
input, a raw/cooked toggle and a method selector, which is the
calculator. Giving that form its own live nutrient readout removes the
reason to start in Calc when the intention is to record something.

It also takes CalcScreen from three responsibilities to one. Execution
record §1.4 records a user-reachable dead end caused by two write-flows
competing over one ternary in this screen; the ternary is now two
branches and the class is gone rather than patched."
```

---

## Task 8: Error boundary

**Files:**
- Create: `src/ui/components/ErrorBoundary.tsx`
- Create: `src/ui/components/ErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<ErrorBoundary resetKey={string} onReset={() => void}>{children}</ErrorBoundary>`.

This is item M5 on the execution record's deferred list, promoted there to a prerequisite
for Phase 4's restore. Phase 3 makes it more urgent: Log is the landing tab and every
figure on it is a derived sum over stored rows, so one malformed row would take down the
screen the app opens on, with no route to the screen that could delete the bad row.

React has no hook equivalent — an error boundary must be a class component. That is the one
place in this codebase where a class is correct.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = ({ go }: { go: boolean }) => {
  if (go) throw new Error('bad row');
  return <p>fine</p>;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(<ErrorBoundary resetKey="log" onReset={() => {}}><Boom go={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows a way out instead of a blank screen when a child throws', () => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary resetKey="log" onReset={() => {}}><Boom go /></ErrorBoundary>);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to the log/i })).toBeInTheDocument();
  });

  it('calls onReset when the way out is taken', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(<ErrorBoundary resetKey="log" onReset={onReset}><Boom go /></ErrorBoundary>);

    await userEvent.click(screen.getByRole('button', { name: /back to the log/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it('recovers when the resetKey changes, so a different tab is not still broken', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="kitchen" onReset={() => {}}><Boom go /></ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<ErrorBoundary resetKey="calc" onReset={() => {}}><Boom go={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/components/ErrorBoundary.test.tsx`

- [ ] **Step 3: Implement**

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Changing this clears the error — navigating away must not stay broken. */
  resetKey: string;
  onReset: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
  resetKey: string;
}

/**
 * The one class component in the codebase: React offers no hook equivalent.
 *
 * Without this, a single malformed stored row takes the whole app down with a
 * blank screen — and Log, which is the landing tab, is entirely derived sums
 * over stored rows. Kitchen is the only screen that can delete a bad row, so
 * the failure would also remove the route to its own fix.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The only record of what actually broke. Matches the wrapped-write
    // convention: the user gets a readable message, the console gets the truth.
    console.error('A screen failed to render', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="screen">
        <p role="alert" className="banner banner--warn">
          Something on this screen could not be shown. This usually means one saved
          row is malformed — the rest of your data is fine.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={this.props.onReset}>
            Back to the Log
          </button>
        </div>
      </div>
    );
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/components/ErrorBoundary.test.tsx`

- [ ] **Step 5: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ErrorBoundary.tsx src/ui/components/ErrorBoundary.test.tsx
git commit -m "feat: add an error boundary with a way back

Item M5 on the execution record's deferred list, which promoted it to a
prerequisite for Phase 4's restore. Phase 3 makes it more urgent: Log is
the landing tab and every figure on it is a derived sum over stored
rows, so one malformed row would take down the screen the app opens on —
and Kitchen, the only screen that can delete the bad row, would be
unreachable behind it.

resetKey clears the error when the tab changes, so a failure on one
screen does not leave the others broken. React offers no hook
equivalent, which is why this is the codebase's only class component."
```

---
## Task 9: `useLog` and the date helpers

**Files:**
- Create: `src/ui/useLog.ts`
- Create: `src/ui/useLog.test.ts`
- Modify: `src/ui/dates.ts`
- Modify: `src/ui/dates.test.ts`

**Interfaces:**
- Consumes: `loadDay` from Task 2.
- Produces:
  ```ts
  // src/ui/dates.ts
  shiftIso(iso: IsoDate, days: number): IsoDate
  dayName(iso: IsoDate, today: IsoDate): string   // 'Today' | 'Yesterday' | '17 Sep 2026'
  // src/ui/useLog.ts
  interface Log { entries: MealEntry[]; dayLog: DayLog | null; loading: boolean;
                  storageError: string | null; refresh: () => Promise<void> }
  useLog(profileId: string | null, date: IsoDate): Log
  ```

- [ ] **Step 1: Write the failing date tests**

Add to `src/ui/dates.test.ts`:

```ts
describe('shiftIso', () => {
  it('steps back a day', () => {
    expect(shiftIso('2026-09-19', -1)).toBe('2026-09-18');
  });

  it('rolls over a month boundary', () => {
    expect(shiftIso('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('rolls over a year boundary', () => {
    expect(shiftIso('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftIso('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('dayName', () => {
  it('names today', () => {
    expect(dayName('2026-09-19', '2026-09-19')).toBe('Today');
  });

  it('names yesterday', () => {
    expect(dayName('2026-09-18', '2026-09-19')).toBe('Yesterday');
  });

  it('gives any other day its date', () => {
    expect(dayName('2026-09-01', '2026-09-19')).toBe(formatIsoDate('2026-09-01'));
  });
});
```

- [ ] **Step 2: Implement the date helpers**

In `src/ui/dates.ts`:

```ts
/**
 * Day arithmetic through a local `Date`, which handles month, year and leap-day
 * rollover for free. Building the result with `todayIso` rather than string
 * surgery keeps it on the same local-calendar footing as every other date in
 * the app — `toISOString()` here would reintroduce the UTC bug the whole module
 * exists to avoid.
 */
export function shiftIso(iso: IsoDate, days: number): IsoDate {
  const [year, month, day] = iso.split('-').map(Number);
  return todayIso(new Date(year, month - 1, day + days));
}

export const dayName = (iso: IsoDate, today: IsoDate): string => {
  if (iso === today) return 'Today';
  if (iso === shiftIso(today, -1)) return 'Yesterday';
  return formatIsoDate(iso);
};
```

- [ ] **Step 3: Write the failing hook tests**

Create `src/ui/useLog.test.ts`, following the shape of `src/ui/useKitchen.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../storage/db';
import { addEntry, dayLogId } from '../storage/meals';
import { useLog } from './useLog';
import type { DayLog, MealEntry } from '../core/types';

const targets: DayLog['targets'] = { kcal: 2310, proteinG: 165, micros: {} };
const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'quick', name: 'Teh tarik', kcal: 180, ...over,
} as MealEntry);

beforeEach(async () => {
  await db.open();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('useLog', () => {
  it('loads a day\'s entries and its frozen targets', async () => {
    await addEntry(entry(), { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });

    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.dayLog?.targets.kcal).toBe(2310);
  });

  it('reloads when the date changes', async () => {
    await addEntry(entry({ id: 'yesterday', date: '2026-09-18' }),
      { id: dayLogId('p1', '2026-09-18'), profileId: 'p1', date: '2026-09-18', targets });

    const { result, rerender } = renderHook(({ d }) => useLog('p1', d), {
      initialProps: { d: '2026-09-19' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(0);

    rerender({ d: '2026-09-18' });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('reloads when the profile changes', async () => {
    await addEntry(entry({ id: 'theirs', profileId: 'p2' }),
      { id: dayLogId('p2', '2026-09-19'), profileId: 'p2', date: '2026-09-19', targets });

    const { result, rerender } = renderHook(({ p }) => useLog(p, '2026-09-19'), {
      initialProps: { p: 'p1' as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(0);

    rerender({ p: 'p2' });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('reads nothing and reports nothing wrong when there is no profile', async () => {
    const { result } = renderHook(() => useLog(null, '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(result.current.dayLog).toBeNull();
    // No profile is a setup state, not a storage failure.
    expect(result.current.storageError).toBeNull();
  });

  it('surfaces a read failure rather than looking like an empty day', async () => {
    db.close();
    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    await db.open();
  });

  it('picks up an entry written after the first load, on refresh', async () => {
    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await addEntry(entry(), { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.entries).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `npx vitest run src/ui/useLog.test.ts src/ui/dates.test.ts`

- [ ] **Step 5: Implement `useLog`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayLog, IsoDate, MealEntry } from '../core/types';
import { loadDay } from '../storage/meals';

export interface Log {
  entries: MealEntry[];
  /** The targets frozen when this day was first logged; null until it is. */
  dayLog: DayLog | null;
  loading: boolean;
  /**
   * Set when the day could not be read. An empty day and an unreadable one
   * look identical on screen, so this has to be surfaced rather than swallowed.
   */
  storageError: string | null;
  refresh: () => Promise<void>;
}

export function useLog(profileId: string | null, date: IsoDate): Log {
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const fetchDay = useCallback(async (gen: number) => {
    // No profile is a setup state, not a failure: there is nothing to read and
    // nothing has gone wrong. Reporting an error here would put a storage
    // warning in front of a first-run user.
    if (profileId === null) {
      if (gen !== generationRef.current) return;
      setEntries([]); setDayLog(null); setStorageError(null); setLoading(false);
      return;
    }

    try {
      const loaded = await loadDay(profileId, date);
      if (gen !== generationRef.current) return;
      setEntries(loaded.entries);
      setDayLog(loaded.dayLog);
      setStorageError(null);
    } catch (err) {
      console.error('Loading the day failed', err);
      if (gen !== generationRef.current) return;
      setStorageError('This day could not be read from storage, so nothing is shown here.');
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, [profileId, date]);

  // Re-runs on profileId or date, via fetchDay's identity. The generation is
  // bumped on teardown so a load in flight for the previous day cannot land
  // after the new one.
  useEffect(() => {
    const gen = ++generationRef.current;
    setLoading(true);
    void fetchDay(gen);
    return () => { generationRef.current += 1; };
  }, [fetchDay]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchDay(gen);
  }, [fetchDay]);

  return { entries, dayLog, loading, storageError, refresh };
}
```

- [ ] **Step 6: Run them and watch them pass, then the three commands**

```bash
npx vitest run src/ui/useLog.test.ts src/ui/dates.test.ts
npm test && npm run build && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/useLog.ts src/ui/useLog.test.ts src/ui/dates.ts src/ui/dates.test.ts
git commit -m "feat: add the useLog hook and day-stepping date helpers

Same generation-counter shape as useKitchen and useProfiles, with one
addition: the effect bumps the generation on entry as well as teardown,
because unlike those two this hook re-runs on a prop change and a load
in flight for the previous day must not land after the new one.

No profile is treated as a setup state rather than a storage failure.
Reporting an error there would put a storage warning in front of every
first-run user.

shiftIso does its arithmetic through a local Date, which handles month,
year and leap-day rollover for free, and rebuilds through todayIso so it
stays on the same local-calendar footing as the rest of the module."
```

---

## Task 10: `DayNav`

**Files:**
- Create: `src/ui/components/DayNav.tsx`
- Create: `src/ui/components/DayNav.test.tsx`

**Interfaces:**
- Consumes: `shiftIso`, `dayName`, `formatIsoDate` from Task 9.
- Produces: `<DayNav date={IsoDate} today={IsoDate} onChange={(d: IsoDate) => void} />`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayNav } from './DayNav';

const setup = (date = '2026-09-19') => {
  const onChange = vi.fn();
  render(<DayNav date={date} today="2026-09-19" onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
};

describe('DayNav', () => {
  it('names today', () => {
    setup();
    expect(screen.getByTestId('day-name')).toHaveTextContent('Today');
  });

  it('steps back a day', async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole('button', { name: /previous day/i }));
    expect(onChange).toHaveBeenCalledWith('2026-09-18');
  });

  it('steps forward a day', async () => {
    const { onChange, user } = setup('2026-09-17');
    await user.click(screen.getByRole('button', { name: /next day/i }));
    expect(onChange).toHaveBeenCalledWith('2026-09-18');
  });

  it('will not walk into the future', () => {
    setup();
    // A food diary records what was eaten. There is nothing to record tomorrow.
    expect(screen.getByRole('button', { name: /next day/i })).toBeDisabled();
  });

  it('jumps to a typed date', async () => {
    const { onChange, user } = setup();
    const field = screen.getByLabelText(/jump to a date/i);
    await user.clear(field);
    await user.type(field, '2026-08-01');
    expect(onChange).toHaveBeenLastCalledWith('2026-08-01');
  });

  it('will not jump into the future either', () => {
    setup();
    expect(screen.getByLabelText(/jump to a date/i)).toHaveAttribute('max', '2026-09-19');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

```tsx
import { useId } from 'react';
import type { IsoDate } from '../../core/types';
import { dayName, shiftIso } from '../dates';

interface Props {
  date: IsoDate;
  today: IsoDate;
  onChange: (date: IsoDate) => void;
}

export function DayNav({ date, today, onChange }: Props) {
  const id = useId();
  // A food diary records what was eaten, so there is nothing to record forward
  // of today. Both the arrow and the date field enforce it — the field needs
  // its own `max` because a typed date never passes through the arrow.
  const atToday = date >= today;

  return (
    <div className="daynav">
      <button
        type="button"
        className="btn btn--secondary daynav__step"
        aria-label="Previous day"
        onClick={() => onChange(shiftIso(date, -1))}
      >
        ←
      </button>

      <span className="daynav__name" data-testid="day-name">{dayName(date, today)}</span>

      <button
        type="button"
        className="btn btn--secondary daynav__step"
        aria-label="Next day"
        disabled={atToday}
        onClick={() => onChange(shiftIso(date, 1))}
      >
        →
      </button>

      <div className="daynav__jump">
        <label htmlFor={id}>Jump to a date</label>
        <input
          id={id}
          type="date"
          value={date}
          max={today}
          onChange={(e) => { if (e.target.value !== '') onChange(e.target.value); }}
        />
      </div>
    </div>
  );
}
```

The `e.target.value !== ''` guard matters: clearing a `<input type="date">` fires a change
with an empty string, and passing that up would ask for the day named "".

- [ ] **Step 4: Run it and watch it pass, then the three commands**

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/DayNav.tsx src/ui/components/DayNav.test.tsx
git commit -m "feat: add day navigation for the Log

Arrows step a day, a date field jumps further. Neither goes past today:
a food diary records what was eaten, and there is nothing to record
tomorrow. The field carries its own max because a typed date never
passes through the arrow.

Clearing a date input fires a change with an empty string, which would
otherwise be passed up as the day to show."
```

---

## Task 11: `DayProgress`

**Files:**
- Create: `src/ui/components/DayProgress.tsx`
- Create: `src/ui/components/DayProgress.test.tsx`

**Interfaces:**
- Consumes: `DayLogTargets` from Task 1, `DayTotals` from Task 4.
- Produces:
  ```tsx
  <DayProgress totals={NutrientProfile} targets={DayLogTargets} proteinExact={boolean} />
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayProgress } from './DayProgress';
import { zeroNutrients } from '../../core/nutrients';

const targets = { kcal: 2000, proteinG: 150, micros: {} };
const totals = { ...zeroNutrients(), kcal: 1000, protein: 75 };

describe('DayProgress', () => {
  it('shows what has been eaten against the target', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact />);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('1,000');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('2,000');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('50%');
  });

  it('marks protein as a floor when a quick entry left it out', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact={false} />);
    expect(screen.getByTestId('protein-progress')).toHaveTextContent('at least');
  });

  it('does not mark protein when every entry carried one', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact />);
    expect(screen.getByTestId('protein-progress')).not.toHaveTextContent('at least');
  });

  it('reports a bar past the target without clipping the number', () => {
    render(<DayProgress totals={{ ...totals, kcal: 3000 }} targets={targets} proteinExact />);
    // The figure is honest; only the bar is capped.
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('150%');
    expect(screen.getByTestId('kcal-bar')).toHaveStyle({ width: '100%' });
  });

  it('says so rather than dividing by zero when there is no target', () => {
    render(<DayProgress totals={totals} targets={{ kcal: 0, proteinG: 0, micros: {} }} proteinExact />);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('no target');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

```tsx
import type { NutrientProfile, DayLogTargets } from '../../core/types';

interface Props {
  totals: NutrientProfile;
  targets: DayLogTargets;
  /** False when a quick entry left its protein figure blank. */
  proteinExact: boolean;
}

const n = (value: number): string => Math.round(value).toLocaleString('en-MY');

function Bar({ testId, label, value, target, unit, floored }: {
  testId: string; label: string; value: number; target: number; unit: string; floored: boolean;
}) {
  const hasTarget = target > 0;
  const pct = hasTarget ? (value / target) * 100 : 0;

  return (
    <div className="progress" data-testid={`${testId}-progress`}>
      <p className={`progress__line${floored ? ' progress__line--estimate' : ''}`}>
        {floored && 'at least '}{n(value)}{unit} of {hasTarget ? `${n(target)}${unit}` : '— no target'}
        {' '}{label}
        {hasTarget && <span className="progress__pct"> · {Math.round(pct)}%</span>}
      </p>
      <div className="progress__track" aria-hidden="true">
        {/* The bar is capped at the track; the figure above it is not, because
            600 kcal over is something the user needs to see. */}
        <div
          className="progress__bar"
          data-testid={`${testId}-bar`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function DayProgress({ totals, targets, proteinExact }: Props) {
  return (
    <div className="day-progress">
      <Bar testId="kcal" label="calories" value={totals.kcal} target={targets.kcal}
           unit=" kcal" floored={false} />
      <Bar testId="protein" label="protein" value={totals.protein} target={targets.proteinG}
           unit="g" floored={!proteinExact} />
    </div>
  );
}
```

Calories are never floored: a `quick` entry requires `kcal`, so the day's calorie total is
always exact. Only protein can be partly unknown.

- [ ] **Step 4: Run it and watch it pass, then the three commands**

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/DayProgress.tsx src/ui/components/DayProgress.test.tsx
git commit -m "feat: show the day's calories and protein against its targets

The bar is capped at the track and the figure above it is not, because
600 kcal over target is the thing the user most needs to see.

Protein carries an 'at least' when a quick entry left its figure blank.
Calories never do: a quick entry requires kcal, so the calorie total is
always exact — which is why the two are separate flags rather than one."
```

---
## Task 12: `describeEntry` and `EntryRow`

**Files:**
- Modify: `src/ui/labels.ts`
- Create: `src/ui/components/EntryRow.tsx`
- Create: `src/ui/components/EntryRow.test.tsx`

**Interfaces:**
- Consumes: `MealContext`, `entryNutrients` from Task 4; `deleteEntry` from Task 2;
  `METHOD_LABELS` from `src/ui/labels.ts`.
- Produces:
  ```ts
  MEAL_LABELS: Record<MealLabel, string>
  describeEntry(entry: MealEntry, ctx: MealContext): string
  ```
  ```tsx
  <EntryRow entry={MealEntry} ctx={MealContext} onEdit={(e: MealEntry) => void} onDeleted={() => void} />
  ```

- [ ] **Step 1: Add the labels**

In `src/ui/labels.ts`:

```ts
export const MEAL_LABELS: Record<MealLabel, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks',
};

/**
 * What an entry says on the Log. Lives beside METHOD_LABELS rather than in the
 * component so the four kinds are described in one place and read consistently.
 */
export function describeEntry(entry: MealEntry, ctx: MealContext): string {
  if (entry.kind === 'quick') return `${entry.name} (quick)`;

  if (entry.kind === 'ingredient') {
    const name = ctx.ingredientById(entry.ingredientId)?.name ?? 'Unknown ingredient';
    return `${name}, ${METHOD_LABELS[entry.method].toLowerCase()} — ${formatG(entry.cookedG)}`;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined) return 'A cook that is no longer in your kitchen';

  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  const method = METHOD_LABELS[session.method].toLowerCase();
  const amount = entry.kind === 'portion'
    ? `${entry.portions} portion${entry.portions === 1 ? '' : 's'}`
    : formatG(entry.grams);

  return `${name}, ${method} — ${amount}`;
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { EntryRow } from './EntryRow';
import { db } from '../../storage/db';
import { addEntry, dayLogId } from '../../storage/meals';
// Reuse the fixtures from core/meals.test.ts — copy them in; the two files are
// allowed to diverge and a shared fixture module would couple them.

describe('EntryRow', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); });

  it('describes the entry and what it was worth', () => {
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={() => {}} />);
    expect(screen.getByTestId('entry-description'))
      .toHaveTextContent('Chicken breast, roasted — 1 portion');
    expect(screen.getByTestId('entry-nutrients')).toHaveTextContent('22g');
  });

  it('asks before deleting, as a plain question rather than an alert', async () => {
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByText(/remove this from the day/i)).toBeInTheDocument();
    // Execution record §3.5: role="alert" means a write failed, never a question.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deletes and reports back', async () => {
    await addEntry(portionEntry, { id: dayLogId('p1', '2026-09-19'), profileId: 'p1',
      date: '2026-09-19', targets: { kcal: 2000, proteinG: 150, micros: {} } });
    const onDeleted = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, remove it/i }));

    expect(await db.mealEntries.count()).toBe(0);
    expect(onDeleted).toHaveBeenCalled();
  });

  it('does not report back when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    const onDeleted = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, remove it/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The callback is proof the row is gone; screens refresh on it.
    expect(onDeleted).not.toHaveBeenCalled();
    await db.open();
  });

  it('hands the entry back for editing', async () => {
    const onEdit = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={onEdit} onDeleted={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(portionEntry);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

- [ ] **Step 4: Implement**

```tsx
import { useState } from 'react';
import type { MealEntry } from '../../core/types';
import { entryNutrients, type MealContext } from '../../core/meals';
import { deleteEntry } from '../../storage/meals';
import { describeEntry } from '../labels';

interface Props {
  entry: MealEntry;
  ctx: MealContext;
  onEdit: (entry: MealEntry) => void;
  onDeleted: () => void;
}

export function EntryRow({ entry, ctx, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = entryNutrients(entry, ctx);

  const remove = async () => {
    try {
      await deleteEntry(entry.id);
    } catch (err) {
      console.error('Deleting a meal entry failed', err);
      setConfirming(false);
      setError('Could not remove this — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    setConfirming(false);
    onDeleted();
  };

  return (
    <div className="entry">
      <p className="entry__description" data-testid="entry-description">
        {describeEntry(entry, ctx)}
      </p>
      <p className="entry__nutrients" data-testid="entry-nutrients">
        {Math.round(n.kcal).toLocaleString('en-MY')} kcal · {Math.round(n.protein)}g protein
      </p>

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement —
              plain text, so role="alert" stays free to mean "a write failed"
              (execution record §3.5). */}
          <p>Remove this from the day? The food goes back to what is left of the cook.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, remove it
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setError(null); setConfirming(false); }}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(entry)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setError(null); setConfirming(true); }}
          >
            Delete
          </button>
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
```

The confirmation copy is true only because the remainder is derived — under Phase 2's
stored field, removing an entry would have needed a compensating write to make it true.

- [ ] **Step 5: Run it and watch it pass, then the three commands**

- [ ] **Step 6: Commit**

```bash
git add src/ui/labels.ts src/ui/components/EntryRow.tsx src/ui/components/EntryRow.test.tsx
git commit -m "feat: add the meal entry row, with describeEntry beside the other labels

Follows the confirm-plus-error shape from execution record §3.5: the
delete question is a plain <p>, role=\"alert\" renders unconditionally and
means only that a write failed, and both confirm transitions clear it.
A failed delete does not call onDeleted, because screens treat that
callback as proof the row is gone and refresh on it.

The confirmation says the food goes back to what is left of the cook,
which is true only because the remainder is derived. Under a stored
field that sentence would have needed a compensating write behind it."
```

---

## Task 13: `AddEntryForm`

The largest component in the phase. Three sources behind a segmented control, reusing
`IngredientPicker`, `WeightInput` and the method selector. It owns its own write, following
the Phase 2 precedent set by `AddBatchForm`.

**Files:**
- Create: `src/ui/components/AddEntryForm.tsx`
- Create: `src/ui/components/AddEntryForm.test.tsx`

**Interfaces:**
- Consumes: `validateEntry`, `entryNutrients`, `MealContext` from Task 4;
  `cookedRemainingG`, `portionsRemaining` from Tasks 3 and 6; `addEntry`, `updateEntry`,
  `dayLogId` from Task 2; `newId` from `src/ui/newId.ts`.
- Produces:
  ```tsx
  <AddEntryForm
    profileId={string} date={IsoDate} label={MealLabel}
    ctx={MealContext} catalogue={readonly Ingredient[]}
    allEntries={readonly MealEntry[]} targets={DayLogTargets}
    editing={MealEntry | undefined}
    onSaved={() => void} onCancel={() => void}
  />
  ```

`allEntries` is every entry in the database, not just the day's: a cook made last week can
be eaten today, so the remainder must count entries from every day and every profile.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('AddEntryForm', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); await db.dayLogs.clear(); });

  it('offers the three sources', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /from the kitchen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /any ingredient/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add/i })).toBeInTheDocument();
  });

  it('lists only cooks with something left', () => {
    // session s1 has 284g; s2 is fully eaten via an existing entry.
    renderForm({ allEntries: [weightEntry({ cookSessionId: 's2', grams: g(284) })] });
    expect(screen.getByTestId('available-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('available-s2')).toBeNull();
  });

  it('logs one portion from the kitchen', async () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written).toMatchObject({ kind: 'portion', cookSessionId: 's1', portions: 1, label: 'lunch' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('writes the day log with the first entry', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [log] = await db.dayLogs.toArray();
    expect(log.id).toBe('p1:2026-09-19');
    expect(log.targets.kcal).toBe(2310);
  });

  it('refuses more than is left, and writes nothing', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /a weighed amount/i }));
    await userEvent.type(screen.getByLabelText(/how much/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('284g');
    expect(await db.mealEntries.count()).toBe(0);
  });

  it('shows what an ingredient entry comes to before it is saved', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /any ingredient/i }));
    await pickIngredient('Chicken breast');
    await enterWeight(142);

    // The readout is the whole reason Calc's hand-off was removed: the form
    // answers the question you would otherwise have gone to Calc to ask.
    expect(screen.getByTestId('entry-preview')).toHaveTextContent('44');
  });

  it('logs a quick entry with no protein figure', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/what was it/i), 'Teh tarik');
    await userEvent.type(screen.getByLabelText(/calories/i), '180');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written).toMatchObject({ kind: 'quick', name: 'Teh tarik', kcal: 180 });
    expect((written as { proteinG?: number }).proteinG).toBeUndefined();
  });

  it('refuses a quick entry with no name', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/calories/i), '180');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await db.mealEntries.count()).toBe(0);
  });

  it('keeps the id and the created time when editing', async () => {
    const existing = weightEntry({ id: 'm1', grams: g(50), createdAt: 999 });
    await db.mealEntries.put(existing);
    renderForm({ editing: existing, allEntries: [existing] });

    await userEvent.clear(screen.getByLabelText(/how much/i));
    await userEvent.type(screen.getByLabelText(/how much/i), '60');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written.id).toBe('m1');
    expect(written.createdAt).toBe(999);
    expect(await db.mealEntries.count()).toBe(1);
  });

  it('measures an edit against the remainder excluding itself', async () => {
    // 250g of a 284g cook already eaten by this very entry; growing it to 260g fits.
    const existing = weightEntry({ id: 'm1', grams: g(250) });
    renderForm({ editing: existing, allEntries: [existing] });

    await userEvent.clear(screen.getByLabelText(/how much/i));
    await userEvent.type(screen.getByLabelText(/how much/i), '260');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not report success when the write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    await db.open();
  });
});
```

Write `renderForm`, `weightEntry`, `pickIngredient` and `enterWeight` as local helpers,
following the ones in `CookSessionForm.test.tsx` and `CalcScreen.test.tsx`.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

```tsx
import { useId, useMemo, useState } from 'react';
import { cookedRemainingG, portionsRemaining } from '../../core/batch';
import { entryNutrients, validateEntry, type MealContext } from '../../core/meals';
import { COOK_METHODS, type CookMethod, type DayLogTargets, type Ingredient,
  type IsoDate, type MealEntry, type MealEntryFields, type MealLabel } from '../../core/types';
import { formatG, g, type Grams } from '../../core/units';
import { addEntry, dayLogId, updateEntry } from '../../storage/meals';
import { METHOD_LABELS } from '../labels';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

type Source = 'kitchen' | 'ingredient' | 'quick';

const SOURCE_LABELS: Record<Source, string> = {
  kitchen: 'From the kitchen', ingredient: 'Any ingredient', quick: 'Quick add',
};

/** An entry being edited cannot change its source; the three are different things. */
const sourceOf = (entry: MealEntry): Source =>
  entry.kind === 'quick' ? 'quick' : entry.kind === 'ingredient' ? 'ingredient' : 'kitchen';

interface Props {
  profileId: string;
  date: IsoDate;
  label: MealLabel;
  ctx: MealContext;
  catalogue: readonly Ingredient[];
  /** Every entry in the database — a cook made last week can be eaten today. */
  allEntries: readonly MealEntry[];
  targets: DayLogTargets;
  editing?: MealEntry;
  onSaved: () => void;
  onCancel: () => void;
}

export function AddEntryForm({
  profileId, date, label, ctx, catalogue, allEntries, targets, editing, onSaved, onCancel,
}: Props) {
  const ids = useId();
  const [source, setSource] = useState<Source>(editing === undefined ? 'kitchen' : sourceOf(editing));
  const [error, setError] = useState<string | null>(null);

  // From-the-kitchen
  const [sessionId, setSessionId] = useState(
    editing !== undefined && (editing.kind === 'portion' || editing.kind === 'weight')
      ? editing.cookSessionId : '');
  const [byWeight, setByWeight] = useState(editing?.kind === 'weight');
  const [portions, setPortions] = useState(editing?.kind === 'portion' ? `${editing.portions}` : '1');
  const [grams, setGrams] = useState<Grams>(editing?.kind === 'weight' ? editing.grams : g(0));

  // Any-ingredient
  const [ingredientId, setIngredientId] = useState(
    editing?.kind === 'ingredient' ? editing.ingredientId : '');
  const [method, setMethod] = useState<CookMethod>(
    editing?.kind === 'ingredient' ? editing.method : 'boiled');
  const [cookedG, setCookedG] = useState<Grams>(
    editing?.kind === 'ingredient' ? editing.cookedG : g(0));
  const [unit, setUnit] = useState<WeightUnit>('g');

  // Quick
  const [name, setName] = useState(editing?.kind === 'quick' ? editing.name : '');
  const [kcalText, setKcalText] = useState(editing?.kind === 'quick' ? `${editing.kcal}` : '');
  const [proteinText, setProteinText] = useState(
    editing?.kind === 'quick' && editing.proteinG !== undefined ? `${editing.proteinG}` : '');

  // Entries excluding the one being edited, so a cook the edit already occupies
  // still shows the room that entry is using.
  const others = useMemo(
    () => allEntries.filter((e) => e.id !== (editing?.id ?? null)),
    [allEntries, editing],
  );

  const available = useMemo(
    () => ctx.sessions
      .map((s) => ({ session: s, left: cookedRemainingG(s, others) }))
      .filter((a) => a.left > 0)
      .sort((a, b) => b.session.cookedAt.localeCompare(a.session.cookedAt)),
    [ctx.sessions, others],
  );

  const draft = (): MealEntryFields | null => {
    if (source === 'quick') {
      const kcal = Number(kcalText.trim());
      const proteinRaw = proteinText.trim();
      return {
        kind: 'quick', name,
        kcal: kcalText.trim() === '' ? NaN : kcal,
        ...(proteinRaw === '' ? {} : { proteinG: Number(proteinRaw) }),
      };
    }
    if (source === 'ingredient') {
      return { kind: 'ingredient', ingredientId, method, cookedG };
    }
    if (sessionId === '') return null;
    return byWeight
      ? { kind: 'weight', cookSessionId: sessionId, grams }
      : { kind: 'portion', cookSessionId: sessionId, portions: Number(portions) };
  };

  // Shown live, before saving. This readout is what makes removing Calc's
  // hand-off a simplification rather than a loss: the form answers the question
  // you would otherwise have opened the calculator to ask.
  const preview = useMemo(() => {
    const d = draft();
    if (d === null) return null;
    const probe: MealEntry = { id: 'preview', profileId, date, label, createdAt: 0, ...d };
    const n = entryNutrients(probe, ctx);
    return n.kcal > 0 || n.protein > 0 ? n : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sessionId, byWeight, portions, grams, ingredientId, method, cookedG,
      name, kcalText, proteinText, ctx]);

  const save = async () => {
    const d = draft();
    if (d === null) { setError('Choose something from the kitchen first.'); return; }

    const check = validateEntry(d, ctx, others, editing?.id ?? null);
    if (!check.ok) { setError(check.message); return; }
    setError(null);

    const entry: MealEntry = {
      id: editing?.id ?? newId(),
      profileId,
      date,
      label,
      // Preserved on edit so an edited entry keeps its place in the day.
      createdAt: editing?.createdAt ?? Date.now(),
      ...d,
    };

    try {
      if (editing === undefined) {
        await addEntry(entry, { id: dayLogId(profileId, date), profileId, date, targets });
      } else {
        await updateEntry(entry);
      }
    } catch (err) {
      console.error('Saving a meal entry failed', err);
      setError('Could not save that — storage may be blocked or full. Please try again.');
      return;
    }

    onSaved();
  };

  const selected = ctx.sessions.find((s) => s.id === sessionId) ?? null;

  return (
    <div className="card entry-form">
      <h3 className="card__title">{editing === undefined ? 'Add to' : 'Edit'} {label}</h3>

      {editing === undefined && (
        <div className="seg" role="group" aria-label="Where this came from">
          {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
            <button
              key={s}
              type="button"
              className="seg__btn"
              aria-pressed={source === s}
              onClick={() => { setError(null); setSource(s); }}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {source === 'kitchen' && (
        <>
          {available.length === 0 ? (
            <p className="screen__hint">
              Nothing cooked is left in the kitchen. Log a cook there, or use
              <strong> Any ingredient</strong> for something you did not buy as a batch.
            </p>
          ) : (
            <ul className="available">
              {available.map(({ session, left }) => (
                <li key={session.id}>
                  <button
                    type="button"
                    data-testid={`available-${session.id}`}
                    className={`available__item${sessionId === session.id ? ' available__item--on' : ''}`}
                    aria-pressed={sessionId === session.id}
                    onClick={() => setSessionId(session.id)}
                  >
                    {describeAvailable(session, left, others, ctx)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected !== null && (
            <>
              <div className="seg" role="group" aria-label="How much">
                <button type="button" aria-pressed={!byWeight} className="seg__btn"
                        onClick={() => setByWeight(false)}>Portions</button>
                <button type="button" aria-pressed={byWeight} className="seg__btn"
                        onClick={() => setByWeight(true)}>A weighed amount</button>
              </div>

              {byWeight ? (
                <WeightInput value={grams} unit="g" label="How much did you eat?"
                             onChange={setGrams} onUnitChange={() => {}} />
              ) : (
                <div className="field">
                  <label htmlFor={`${ids}-portions`}>How many portions?</label>
                  <input id={`${ids}-portions`} type="number" inputMode="decimal"
                         min={0} step="0.5" value={portions}
                         onChange={(e) => setPortions(e.target.value)} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {source === 'ingredient' && (
        <>
          <IngredientPicker
            catalogue={catalogue}
            value={ingredientId}
            onChange={setIngredientId}
            // Adding an ingredient mid-meal is a Kitchen job; keeping the flow
            // out of here is what stops this form growing a second screen.
            onAddNew={() => setError('Add new ingredients from the Kitchen tab.')}
          />
          <div className="field">
            <label htmlFor={`${ids}-method`}>How was it cooked?</label>
            <select id={`${ids}-method`} value={method}
                    onChange={(e) => setMethod(e.target.value as CookMethod)}>
              {COOK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </div>
          <WeightInput value={cookedG} unit={unit} label="How much did you eat? (cooked)"
                       onChange={setCookedG} onUnitChange={setUnit} />
        </>
      )}

      {source === 'quick' && (
        <>
          <div className="field">
            <label htmlFor={`${ids}-name`}>What was it?</label>
            <input id={`${ids}-name`} type="text" value={name}
                   onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-kcal`}>Roughly how many calories?</label>
            <input id={`${ids}-kcal`} type="number" inputMode="decimal" min={0}
                   value={kcalText} onChange={(e) => setKcalText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-protein`}>Protein in grams (optional)</label>
            <input id={`${ids}-protein`} type="number" inputMode="decimal" min={0}
                   value={proteinText} onChange={(e) => setProteinText(e.target.value)} />
            <p className="field__hint">
              Leave blank if you do not know — the day will say "at least" instead of
              claiming a figure it does not have.
            </p>
          </div>
        </>
      )}

      {preview !== null && (
        <p className="entry-form__preview" data-testid="entry-preview">
          {Math.round(preview.kcal).toLocaleString('en-MY')} kcal ·{' '}
          {Math.round(preview.protein)}g protein
        </p>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void save(); }}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      </div>

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
```

Add the `describeAvailable` helper to `src/ui/labels.ts` beside `describeEntry`:

```ts
export function describeAvailable(
  session: CookSession,
  left: Grams,
  entries: readonly MealEntry[],
  ctx: MealContext,
): string {
  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  const portions = portionsRemaining(session, entries);
  return `${name}, ${METHOD_LABELS[session.method].toLowerCase()} — ${formatG(left)} left ` +
         `· ${portions.toFixed(1)} portions`;
}
```

- [ ] **Step 4: Run them and watch them pass, then the three commands**

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/AddEntryForm.tsx src/ui/components/AddEntryForm.test.tsx src/ui/labels.ts
git commit -m "feat: add the meal entry form, with three sources

From the kitchen, any ingredient, or a quick add. The middle one is what
lets a day stay honest: without it, everything not bought as a tracked
batch has to be a quick add with a guessed calorie figure, and the
micronutrient rollup ends up averaging over food whose micronutrients
are unknown.

It shows what an entry comes to before saving. That readout is the whole
reason removing Calc's hand-off is a simplification rather than a loss:
the form answers the question you would otherwise have opened the
calculator to ask.

allEntries is every entry in the database, not the day's, because a cook
made last week can be eaten today. The entry being edited is filtered
out of that set before anything is measured against it — otherwise
growing an entry is compared against the room its own current value
already occupies, and a valid edit is refused.

Editing preserves id and createdAt, so an edited entry keeps its place
in the day rather than jumping to the end."
```

---
## Task 14: `MealGroup`

**Files:**
- Create: `src/ui/components/MealGroup.tsx`
- Create: `src/ui/components/MealGroup.test.tsx`

**Interfaces:**
- Consumes: `EntryRow` from Task 12; `MEAL_LABELS` from Task 12.
- Produces:
  ```tsx
  <MealGroup label={MealLabel} entries={readonly MealEntry[]} ctx={MealContext}
             onAdd={() => void} onEdit={(e: MealEntry) => void} onChanged={() => void} />
  ```

- [ ] **Step 1: Write the failing test**

```tsx
describe('MealGroup', () => {
  it('names the meal and offers to add to it', async () => {
    const onAdd = vi.fn();
    render(<MealGroup label="lunch" entries={[]} ctx={ctx} onAdd={onAdd}
                      onEdit={() => {}} onChanged={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add to lunch/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders a row per entry', () => {
    render(<MealGroup label="lunch" entries={[portionEntry, quickEntry]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.getAllByTestId('entry-description')).toHaveLength(2);
  });

  it('shows the meal\'s own calorie subtotal once it has entries', () => {
    render(<MealGroup label="lunch" entries={[quickEntry]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.getByTestId('group-subtotal-lunch')).toHaveTextContent('180');
  });

  it('shows no subtotal for an empty meal', () => {
    render(<MealGroup label="dinner" entries={[]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.queryByTestId('group-subtotal-dinner')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

```tsx
import { dayTotals, type MealContext } from '../../core/meals';
import type { MealEntry, MealLabel } from '../../core/types';
import { MEAL_LABELS } from '../labels';
import { EntryRow } from './EntryRow';

interface Props {
  label: MealLabel;
  entries: readonly MealEntry[];
  ctx: MealContext;
  onAdd: () => void;
  onEdit: (entry: MealEntry) => void;
  onChanged: () => void;
}

export function MealGroup({ label, entries, ctx, onAdd, onEdit, onChanged }: Props) {
  // Reuses dayTotals rather than summing here: a meal is a day in miniature,
  // and two summing implementations would eventually disagree.
  const subtotal = entries.length === 0 ? null : dayTotals(entries, ctx).totals;

  return (
    <section className="meal-group">
      <div className="meal-group__head">
        <h3>{MEAL_LABELS[label]}</h3>
        <button type="button" className="btn btn--secondary btn--small" onClick={onAdd}>
          Add to {MEAL_LABELS[label].toLowerCase()}
        </button>
      </div>

      {subtotal !== null && (
        <p className="meal-group__subtotal" data-testid={`group-subtotal-${label}`}>
          {Math.round(subtotal.kcal).toLocaleString('en-MY')} kcal ·{' '}
          {Math.round(subtotal.protein)}g protein
        </p>
      )}

      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} ctx={ctx} onEdit={onEdit} onDeleted={onChanged} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run it and watch it pass, then the three commands**

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/MealGroup.tsx src/ui/components/MealGroup.test.tsx
git commit -m "feat: group a day's entries by meal

The subtotal goes through dayTotals rather than summing locally. A meal
is a day in miniature, and two summing implementations would eventually
disagree about a case neither author was thinking about."
```

---

## Task 15: `LogScreen`

**Files:**
- Create: `src/ui/screens/LogScreen.tsx`
- Create: `src/ui/screens/LogScreen.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4, 9, 10, 11, 13, 14; `useKitchen` (Task 5),
  `useCatalogue`, `NutrientTable`, `snapshotTargets` (Task 4).
- Produces: `<LogScreen profile={Profile | null} today={Date} />`

- [ ] **Step 1: Write the failing tests**

```tsx
describe('LogScreen', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); await db.dayLogs.clear(); });

  it('asks for a profile before anything else', () => {
    render(<LogScreen profile={null} today={new Date(2026, 8, 19)} />);
    expect(screen.getByTestId('log-no-profile')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to breakfast/i })).toBeNull();
  });

  it('opens on today with four empty meals', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));

    for (const name of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('shows a logged entry against the day\'s targets', async () => {
    await seedQuickEntry({ date: '2026-09-19', kcal: 500, proteinG: 30 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);

    expect(await screen.findByTestId('entry-description')).toHaveTextContent('(quick)');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('500');
  });

  it('steps back to a past day and shows what was logged there', async () => {
    await seedQuickEntry({ date: '2026-09-18', kcal: 700 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));

    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    expect(await screen.findByTestId('day-name')).toHaveTextContent('Yesterday');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('700');
  });

  it('measures a past day against its own frozen targets, not the current ones', async () => {
    // A DayLog written when the target was 2,000 kcal.
    await seedQuickEntry({ date: '2026-09-18', kcal: 1000, targets: { kcal: 2000, proteinG: 150, micros: {} } });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    // 1000 of 2000 is 50%. Against the profile's real target it would not be.
    expect(await screen.findByTestId('kcal-progress')).toHaveTextContent('50%');
  });

  it('lets a past day be edited', async () => {
    await seedQuickEntry({ date: '2026-09-18', kcal: 700 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    // Forgetting to log dinner and fixing it the next morning is the most
    // ordinary thing a food diary has to handle.
    expect(await screen.findByRole('button', { name: /add to dinner/i })).toBeEnabled();
  });

  it('defaults the meal to the time of day', async () => {
    // 09:00 is breakfast; the form should open on it.
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19, 9, 0)} />);
    await userEvent.click(await screen.findByTestId('add-entry'));
    expect(screen.getByRole('heading', { name: /add to breakfast/i })).toBeInTheDocument();
  });

  it('says the micronutrients are a floor when a quick entry is in the day', async () => {
    await seedQuickEntry({ date: '2026-09-19', kcal: 500, proteinG: 30 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);

    expect(await screen.findByTestId('micro-floor')).toHaveTextContent(/at least/i);
  });

  it('does not say so on a day with no quick entries', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toBeInTheDocument());
    expect(screen.queryByTestId('micro-floor')).toBeNull();
  });

  it('surfaces a read failure rather than looking like an empty day', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await db.open();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement**

```tsx
import { useMemo, useState } from 'react';
import { dayTotals, type MealContext } from '../../core/meals';
import { ageFrom, snapshotTargets } from '../../core/targets';
import { MEAL_LABEL_KEYS, type MealEntry, type MealLabel, type Profile } from '../../core/types';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { DV_US } from '../../data/dvUS';
import { RETENTION } from '../../data/retentionTable';
import { RNI_MIN_AGE, rniFor } from '../../data/rniMY';
import { AddEntryForm } from '../components/AddEntryForm';
import { DayNav } from '../components/DayNav';
import { DayProgress } from '../components/DayProgress';
import { MealGroup } from '../components/MealGroup';
import { NutrientTable } from '../components/NutrientTable';
import { todayIso } from '../dates';
import { useCatalogue } from '../useCatalogue';
import { useKitchen } from '../useKitchen';
import { useLog } from '../useLog';

/**
 * The meal a new entry lands in unless the user says otherwise. Boundaries are
 * generous on purpose: being wrong is one tap to fix, and being asked every
 * time is a tap you always pay.
 */
export function labelForHour(hour: number): MealLabel {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

type View = { kind: 'list' } | { kind: 'form'; label: MealLabel; editing?: MealEntry };

export function LogScreen({ profile, today = new Date() }: { profile: Profile | null; today?: Date }) {
  const [date, setDate] = useState(() => todayIso(today));
  const [view, setView] = useState<View>({ kind: 'list' });

  const { catalogue } = useCatalogue();
  const kitchen = useKitchen();
  const log = useLog(profile?.id ?? null, date);

  const ctx: MealContext = useMemo(() => ({
    sessions: kitchen.sessions,
    batches: kitchen.batches,
    ingredientById: (id) => catalogue.find((i) => i.id === id),
    samples: kitchen.samples,
    categoryYield: CATEGORY_YIELD,
    retention: RETENTION,
  }), [kitchen.sessions, kitchen.batches, kitchen.samples, catalogue]);

  const totals = useMemo(() => dayTotals(log.entries, ctx), [log.entries, ctx]);

  // A day that has been logged is measured against the targets frozen then.
  // A day that has not is measured against the profile's targets now — and
  // those are the ones that will be frozen when its first entry lands.
  const targets = useMemo(
    () => log.dayLog?.targets
      ?? (profile === null
        ? { kcal: 0, proteinG: 0, micros: {} }
        : snapshotTargets(profile, today, rniFor, DV_US)),
    [log.dayLog, profile, today],
  );

  if (profile === null) {
    return (
      <section className="screen">
        <h2>Log</h2>
        <p className="screen__hint" data-testid="log-no-profile">
          Set up a profile first — the Log measures what you eat against your daily
          calorie and protein targets, and those come from your body stats.
        </p>
      </section>
    );
  }

  if (view.kind === 'form') {
    return (
      <section className="screen">
        <AddEntryForm
          profileId={profile.id}
          date={date}
          label={view.label}
          ctx={ctx}
          catalogue={catalogue}
          allEntries={kitchen.entries}
          targets={targets}
          editing={view.editing}
          onSaved={() => {
            // Both: useLog holds the day, useKitchen holds every entry and so
            // every remainder. Refreshing one leaves the other stale.
            void log.refresh();
            void kitchen.refresh();
            setView({ kind: 'list' });
          }}
          onCancel={() => setView({ kind: 'list' })}
        />
      </section>
    );
  }

  const afterChange = () => { void log.refresh(); void kitchen.refresh(); };
  const storageError = log.storageError ?? kitchen.storageError;

  return (
    <section className="screen">
      <h2>Log</h2>

      <DayNav date={date} today={todayIso(today)} onChange={setDate} />

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <DayProgress
        totals={totals.totals}
        targets={targets}
        proteinExact={totals.unknownProteinEntries === 0}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          data-testid="add-entry"
          onClick={() => setView({ kind: 'form', label: labelForHour(today.getHours()) })}
        >
          Add something
        </button>
      </div>

      {MEAL_LABEL_KEYS.map((label) => (
        <MealGroup
          key={label}
          label={label}
          entries={log.entries.filter((e) => e.label === label)}
          ctx={ctx}
          onAdd={() => setView({ kind: 'form', label })}
          onEdit={(entry) => setView({ kind: 'form', label: entry.label, editing: entry })}
          onChanged={afterChange}
        />
      ))}

      {log.entries.length > 0 && (
        <div className="card">
          <h3 className="card__title">Nutrients for the day</h3>
          {totals.unknownMicroEntries > 0 && (
            <p className="flag" data-testid="micro-floor">
              At least these amounts — {totals.unknownMicroEntries} quick{' '}
              {totals.unknownMicroEntries === 1 ? 'entry has' : 'entries have'} no
              micronutrient figures, so the real total is higher.
            </p>
          )}
          <div className="table-scroll">
            <NutrientTable
              totals={totals.totals}
              targets={targets.micros}
              assumedRetentionFor={[]}
              belowRniAge={ageFrom(profile, today) < RNI_MIN_AGE}
            />
          </div>
        </div>
      )}
    </section>
  );
}
```

`assumedRetentionFor` is empty because a day mixes cooks with different methods, so a
per-nutrient retention caveat cannot be attributed to any one of them. The per-entry
version of that caveat already appears on the calculator, which is where it is actionable.

`flag` and `banner--warn` both already exist in `src/index.css`. Note that the base `.flag`
class is *already* the amber estimate treatment — `--estimate` on `--estimate-soft` — and
`.flag--implausible` is the modifier that overrides it to red. A micronutrient floor wants
the base class with no modifier.

- [ ] **Step 4: Run them and watch them pass, then the three commands**

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/LogScreen.tsx src/ui/screens/LogScreen.test.tsx
git commit -m "feat: add the Log screen

One day at a time, opening on today, stepping back through DayNav. Past
days render against their own frozen targets and stay fully editable:
forgetting to log dinner and fixing it the next morning is the most
ordinary thing a food diary has to handle, and entries are dated rows,
so it costs nothing.

A day with no DayLog yet is measured against the profile's targets now
— which are exactly the targets that will be frozen when its first entry
lands, so the figure never jumps when it does.

Saving refreshes both hooks. useLog holds the day and useKitchen holds
every entry and therefore every remainder; refreshing one leaves the
other showing food that has already been eaten.

The day's nutrient table passes an empty assumedRetentionFor: a day
mixes cooks with different methods, so a per-nutrient retention caveat
cannot be attributed to one of them. That caveat already appears per
entry on the calculator, where it is actionable."
```

---
## Task 16: Turn on the Log tab

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `LogScreen` (Task 15), `ErrorBoundary` (Task 8).
- Produces: a four-tab app landing on Log.

- [ ] **Step 1: Write the failing tests**

```tsx
  it('lands on the Log', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'log', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: /log/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('renames the Today tab to Log', async () => {
    render(<App />);
    expect(screen.queryByRole('tab', { name: /today/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /log/i })).toBeEnabled();
  });

  it('falls back to the Log when the stored tab is one that does not exist', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null,
      landingTab: 'costs' as never, defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: /log/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the rest of the app usable when a screen throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Force Kitchen to throw by making its load reject in a way that surfaces
    // during render — see the helper below.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /kitchen/i }));
    // ...assert the boundary's message, then:
    await userEvent.click(screen.getByRole('tab', { name: /calc/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
```

For the last one, the simplest honest trigger is `vi.mock`ing one of Kitchen's imports to
throw on render. If that proves awkward, assert the boundary only through
`ErrorBoundary.test.tsx` (Task 8 covers it directly) and reduce this to a test that the
boundary is present in the tree — do not delete it silently.

- [ ] **Step 2: Implement**

In `src/ui/App.tsx`:

```tsx
type Tab = 'log' | 'kitchen' | 'calc' | 'costs' | 'profile';

const TABS: { id: Tab; label: string; phase?: number }[] = [
  { id: 'log', label: 'Log' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs', phase: 4 },
  { id: 'profile', label: 'Profile' },
];

const BUILT: readonly Tab[] = ['log', 'kitchen', 'calc', 'profile'];
```

Change the initial state to `useState<Tab>('log')` and the settings fallback to `'log'`:

```tsx
        setTab(BUILT.includes(settings.landingTab) ? settings.landingTab : 'log');
```

Wrap `<main>`'s contents in the boundary, keyed on the tab so leaving a broken screen
clears it:

```tsx
      <main className="app__main">
        <ErrorBoundary resetKey={tab} onReset={() => selectTab('log')}>
          {tab === 'log' && <LogScreen profile={profile} />}
          {tab === 'kitchen' && <KitchenScreen />}
          {tab === 'calc' && <CalcScreen profile={profile} />}
          {tab === 'profile' && (
            <ProfileScreen
              profiles={profiles}
              activeId={profile?.id ?? null}
              storageError={storageError}
              onSetActive={(id) => { void setActive(id); }}
              onChanged={() => { void refresh(); }}
            />
          )}
        </ErrorBoundary>
      </main>
```

The existing "Set up a profile to see what a portion is worth" banner is now redundant on
Log, which says it better in context. Leave it scoped to `tab === 'calc'` as it already is.

- [ ] **Step 3: Run the three commands**

```bash
npm test && npm run build && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat: turn on the Log tab

Four tabs, landing on Log. 'Today' was the parent spec's name and is
wrong the moment past days are reachable.

The error boundary is keyed on the tab, so a screen that fails does not
leave every other screen behind it broken, and its way out lands on Log."
```

---

## Task 17: Styles

**Files:**
- Modify: `src/index.css`

**Interfaces:** none — classes only.

Every class used by Tasks 10–15 must exist, and **every token must be one that
`src/index.css` already defines in both `:root` and its
`@media (prefers-color-scheme: dark)` block.** Inventing a token name with a hard-coded hex
fallback produces CSS that is valid, renders correctly in light mode, renders a light panel
with dark text in dark mode, and cannot be caught by any test (execution record §1.5).

- [ ] **Step 1: List what is needed and check each token exists**

```bash
grep -n "^\s*--" src/index.css | sed -n '1,80p'
grep -rho 'className="[^"]*"' src/ui/components/DayNav.tsx src/ui/components/DayProgress.tsx \
  src/ui/components/EntryRow.tsx src/ui/components/MealGroup.tsx \
  src/ui/components/AddEntryForm.tsx src/ui/screens/LogScreen.tsx | sort -u
```

Every class in the second list must either already exist in `index.css` or be added in
Step 2. Every `var(--…)` you write must appear in the first.

**Already present, do not redefine:** `screen__hint`, `banner--warn`, `banner--info`,
`card__title`, `table-scroll`, `field`, `seg`, `seg__btn` (its selected state is
`.seg__btn[aria-pressed='true']` — there is no `--on` modifier), `flag` (already the amber
estimate treatment) and `flag--implausible`.

**Introduced by this task:** `daynav*`, `day-progress`, `progress*`, `meal-group*`,
`entry*`, `entry-form__preview`, `available*`, `field__hint`, `btn--small`.

- [ ] **Step 2: Add the styles**

```css
/* Log: day navigation, one row, arrows either side of the day's name. */
.daynav {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin-bottom: var(--sp-3);
}

.daynav__step { flex: none; min-width: 3rem; }

.daynav__name {
  flex: 1;
  text-align: center;
  font-weight: 600;
}

.daynav__jump { flex-basis: 100%; }
.daynav__jump label { display: block; font-size: var(--fs-xs); color: var(--text-dim); }
.daynav__jump input { width: 100%; }

/* Day progress: a figure that tells the truth over a bar that is capped. */
.day-progress { margin-bottom: var(--sp-4); }
.progress + .progress { margin-top: var(--sp-3); }
.progress__line { margin: 0 0 var(--sp-2); font-size: var(--fs-sm); }
.progress__line--estimate { color: var(--estimate); }
.progress__pct { color: var(--text-dim); }

.progress__track {
  height: 0.5rem;
  border-radius: var(--radius);
  background: var(--surface-sunken);
  overflow: hidden;
}

.progress__bar { height: 100%; background: var(--accent); }

/* One meal, its subtotal and its entries. */
.meal-group { margin-bottom: var(--sp-4); }

.meal-group__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.meal-group__head h3 { margin: 0; }

.meal-group__subtotal {
  margin: var(--sp-2) 0 0;
  color: var(--text-dim);
  font-size: var(--fs-sm);
}

.entry {
  padding: var(--sp-3) 0;
  border-bottom: var(--border);
}

.entry__description { margin: 0 0 var(--sp-2); }

.entry__nutrients {
  margin: 0 0 var(--sp-2);
  color: var(--text-dim);
  font-size: var(--fs-sm);
}

/* The add-entry form's list of cooks with something left. */
.entry-form__preview {
  margin: var(--sp-3) 0 0;
  color: var(--text-dim);
  font-size: var(--fs-sm);
}

.available { list-style: none; margin: 0 0 var(--sp-3); padding: 0; }
.available li + li { margin-top: var(--sp-2); }

.available__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--sp-3);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  font: inherit;
  color: inherit;
}

.available__item--on { border-color: var(--accent); }

.btn--small { padding: var(--sp-2) var(--sp-3); font-size: var(--fs-sm); }

.field__hint {
  margin: var(--sp-2) 0 0;
  color: var(--text-dim);
  font-size: var(--fs-xs);
}
```

If `--accent`, `--estimate`, `--surface-sunken`, `--border`, `--radius`, `--sp-2/3/4`,
`--fs-xs/sm` or `--text-dim` is not in the grep from Step 1 under **both** `:root` and the
dark-mode block, stop and use one that is.

- [ ] **Step 3: Look at it in both colour schemes**

```bash
npm run dev
```

Open the Log tab. Then toggle the OS or browser colour scheme and look again. Tokens are
not proof: execution record §5 records that Phase 2's dark mode was verified by token and
never by eye.

- [ ] **Step 4: Run the three commands and commit**

```bash
npm test && npm run build && npm run lint
git add src/index.css
git commit -m "style: add the Log screen's styles

Existing tokens only, checked against both :root and the dark-mode
block. Execution record §1.5: an invented token name with a hex fallback
is valid CSS that renders correctly in light mode, renders a light panel
with dark text in dark mode, and no test can catch it."
```

---

## Task 18: Whole-branch verification

**Files:** none changed unless something is found.

- [ ] **Step 1: Confirm the numbers**

```bash
nvm use
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
npm run lint
```

Expected: every test passing; clean build; exactly one lint warning
(`WeightInput.tsx:23`). Record the file and test counts — they go in the execution record.

- [ ] **Step 2: Confirm the golden suite was never touched**

```bash
git diff main --stat -- src/core/golden.test.ts
```

Expected: no output. Any diff at all is a finding, not a cleanup.

- [ ] **Step 3: Confirm the stored remainder is really gone**

```bash
grep -rn "cookedRemainingG" src/
```

Expected: every hit is the **function** — its definition in `core/batch.ts`, and calls or
imports of it (`AddEntryForm.tsx`, `SessionRow.tsx`, `BatchCard.tsx`, and tests). A hit
reading it as a **property** off a session object is a survivor and must be fixed. The
distinguishing shape is `session.cookedRemainingG` or `cookedRemainingG:` in an object
literal:

```bash
grep -rn "\.cookedRemainingG\|cookedRemainingG:" src/
```

Expected: no output.

```bash
grep -rn "applyEat\|validateEat\|rescaleCookedRemaining\|EatControl\|log this as a batch" src/
```

Expected: no hits.

- [ ] **Step 4: Walk the lifecycle by hand at phone width**

`npm run dev`, open at 390px, and do this in order. Execution record §5 records that the
equivalent Phase 2 walkthrough **was never done** — do not repeat that.

1. Profile → add a profile. Note the calorie and protein targets.
2. Kitchen → log a 1kg chicken-breast purchase at RM20.
3. Kitchen → cook 400g roasted to 284g in 4 portions.
4. Kitchen → confirm the card reads 284g cooked left, 4.0 portions, and that there is
   **no** eat control anywhere on the screen.
5. Log → add from the kitchen, one portion. Confirm the progress bars move, the entry shows
   roughly 412 kcal, and Kitchen now reads 213g left · 3.0 portions.
6. Log → quick add a teh tarik at 180 kcal with no protein. Confirm protein reads
   "at least" and the nutrient table carries the micronutrient floor line.
7. Log → any ingredient: 2 eggs, fried. Confirm the preview shows a figure before saving.
8. Log → edit the portion entry to a weighed 100g. Confirm Kitchen's remainder follows.
9. Log → delete it. Confirm Kitchen goes back to 284g.
10. Log → step back a day, add an entry to yesterday, step forward. Confirm today is
    unchanged and yesterday holds its own entry.
11. Profile → change the weight by 5kg. Step back to yesterday. **Confirm yesterday's
    percentages have not moved.** This is what `DayLog` exists for and no test can
    substitute for seeing it.
12. Kitchen → delete the batch. Confirm the confirmation names what goes with it and that
    the Log entries against it are gone afterwards.
13. Toggle dark mode and walk steps 4–6 again.

Check throughout: no horizontal scroll, every control reachable one-thumb, a four-meal day
still readable.

- [ ] **Step 5: Write the execution record**

Create `docs/superpowers/2026-09-19-phase-3-execution-record.md`, following the Phase 2 one.
It must include:

- The outcome table: test files, tests, build, lint, before and after.
- **Every place this plan was wrong**, with what the evidence was. Phase 2's record opens
  with that section because it turned out to be the most useful thing in the document.
- Design rulings made during execution that are not in the spec.
- Known gaps carried forward, each with why it was deferred.
- What was **not** verified.
- What Phase 4 inherits.

- [ ] **Step 6: Commit and report**

```bash
git add docs/superpowers/2026-09-19-phase-3-execution-record.md
git commit -m "docs: add the Phase 3 execution record"
```

Then report to the user: the counts, anything found in Steps 1–4, and whether the manual
walkthrough passed — naming any step that did not.

---

## Plan self-review

Run against the spec after writing, before execution.

**Spec coverage.** Every section maps to a task:

| Spec section | Task |
|---|---|
| §2 responsibility split | 6 (Kitchen), 7 (Calc), 15 (Log) |
| §2 tab named Log | 16 |
| §3.1 `Meal` is not a table | 1 |
| §3.2 remainder derived | 3, 6 |
| §3.3 fourth entry kind | 1, 4, 13 |
| §3.4 closed `MealLabel` | 1 |
| §4 schema v3, indexes, DayLog transaction | 1, 2 |
| §4 cascade to meal entries | 5 |
| §4 `useKitchen` loads entries | 5 |
| §5 `core/meals.ts` | 4 |
| §5 portion nutrition rule | 4 |
| §5 `editingId` required | 4, 13 |
| §6 Log screen and components | 10–15 |
| §6 clock-defaulted meal label | 15 |
| §6 past days editable | 15 |
| §6 Kitchen and Calc changes | 6, 7 |
| §6 `landingTab` widened | 1, 16 |
| §7 error boundary | 8, 16 |
| §7 micronutrient and protein floors | 4, 11, 15 |
| §7 confirm-plus-error shape | 12 |
| §7 wrapped writes | 12, 13 |
| §8 invariants | 3, 4, 5, 12, 13, 15, 18 |
| §9 out of scope | not implemented, by design |

**Known deviations from the spec, both deliberate:**

1. **Module boundary.** The gram-level derivations go in `core/batch.ts`, not
   `core/meals.ts`, to break a circular import. Explained above under "A note on module
   boundaries" and repeated in Task 3.
2. **`validateCookEdit` instead of a plain weight guard.** Spec §7 says an edit below what
   has been eaten is blocked. Planning found that a `portion` entry's grams are relative to
   the cooked weight and portion count, so the guard must be evaluated at the *draft's*
   values, not the session's — otherwise shrinking a cook eaten only in portions is wrongly
   refused, and recutting the portion count is wrongly allowed. Task 3 covers both.

**Type consistency.** `cookedRemainingG` is a function from Task 3 everywhere after Task 6.
`portionsRemaining(session, entries)` and `batchState(batch, sessions, entries)` carry the
entries argument from Task 6 onward. `MealContext` is defined once in Task 4 and consumed
unchanged by Tasks 12–15. `MealEntryFields` is the draft type in Tasks 1, 4 and 13.
`portionsToGrams` survives and is named as surviving in Task 6.
