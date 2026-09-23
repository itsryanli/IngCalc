# IngCalc Phase 4 — Costs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on the Costs tab: a sortable purchase table scoped by a date range, totals by
location and by month, two CSV exports, and a JSON backup that can be restored by replacing
or merging.

**Architecture:** All arithmetic and all validation are pure, in `core/`. `core/costs.ts`
(rows, ranges, sorting, totals, CSV rows), `core/csv.ts` (serialisation) and `core/backup.ts`
(envelope, row guards, integrity, restore planning) are new, and `core/cost.ts` gains
`entryCostMYR`. The one I/O module is `storage/backup.ts`, which reads and writes all seven
tables in single transactions. The UI is a `CostsScreen` built from four small components.
There is no schema change.

**Tech Stack:** React 19, TypeScript 6, Dexie 4 over IndexedDB, Vitest 4 + Testing Library +
user-event, Vite 8, oxlint. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-phase-4-costs-design.md`
**Also read:** `docs/superpowers/2026-09-20-phase-3-execution-record.md` §7–8.

## Global Constraints

- **Node 22.12.0 or later is required to run the tests at all.** The shell defaults to 22.7,
  where every test file fails to load with `ERR_REQUIRE_ESM`. Prefix every command with
  `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH";` or run `nvm use` first.
- **Run `npm test`, `npm run build` and `npm run lint` after EVERY task.** `vitest` does not
  typecheck; only the build catches a type error. Test files are inside `src` and are
  typechecked by the build too.
- **Baseline to preserve:** 50 test files, 637 tests, clean build, exactly one lint warning
  (`WeightInput.tsx:23` react/set-state-in-effect). A second warning is a regression.
- **The golden-value suite is not to be touched.** `src/core/golden.test.ts`. This phase adds
  no nutrient arithmetic.
- **`src/core/` stays pure.** No imports from `react`, `dexie`, `../ui/`, `../data/` or
  `../storage/` in non-test files. `purity.test.ts` enforces the first four. Bundled data
  (`INGREDIENTS`, `RETENTION`, `CATEGORY_YIELD`) is passed in as arguments. Test files may
  import from `data/`.
- **Grams and MYR are branded.** Never pass a bare `number` where `Grams`/`MYR` is expected
  and never cast to them. Use `g(...)` / `myr(...)`.
- **Dates are local calendar dates.** Use `todayIso()` and `formatIsoDate()` from
  `src/ui/dates.ts`. Never `toISOString()` for a calendar date. The one exception is the
  backup's `exportedAt`, which is an instant.
- **Confirm-plus-error shape.** A confirmation question is a plain `<p>`. `role="alert"` is
  reserved for something that actually failed.
- **Every storage write is wrapped:** try/catch, `console.error` with the real error and an
  operation name, a user-facing message via `role="alert"`, and **the success callback is not
  invoked on failure**.
- **CSS uses existing tokens only** (check `:root` in `src/index.css`). Every new colour must
  come from a token that the dark-mode block redefines.
- **Copy is verbatim from the spec** where the spec gives it. Where this plan gives exact
  strings, tests assert them exactly.

## Where this plan departs from the spec

Each is a consequence of reading the code, recorded so reviewers do not flag it as drift:

1. **`Settings` moves into `core/types.ts`** and `storage/db.ts` re-exports it. `core/backup.ts`
   has to name the settings row's type, and `core/` may not import `storage/`.
2. **`entryItemName` lives in `ui/labels.ts`, not `core/costs.ts`.** It needs `METHOD_LABELS`,
   which is UI copy in `ui/`. `mealCsvRows` takes an `itemName` callback instead, as
   `MealContext` already does for ingredients.
3. **`PurchaseRow` gains `proteinRawG`**, and `SortKey` is an explicit union of the eight
   visible columns rather than `keyof Omit<…>`. The summary's weighted protein-per-RM needs
   the grams, and RM/kg cooked is a CSV column, not a table column.
4. **The summary divides by the spend on rows whose protein is known.** A purchase of an
   unresolvable ingredient would otherwise pull the figure down with money that bought
   "no protein".
5. **Row guards are table-driven** (one spec list per table) rather than seven hand-written
   `isX` functions. The behaviour is as specified. The per-field falsification tests are the
   same.
6. **No `dataGeneration` remount after a restore.** Only one screen is mounted at a time, and
   the others read storage when they mount. Costs refreshes its own hooks and `App` refreshes
   profiles (which re-reads settings). Remounting would also have discarded the success
   message the spec asks for.
7. **A blank location sorts as empty (last), like `null`.** It renders as `—`, so it should
   sort like one.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `vite.config.ts` | modify | `test.pool: 'threads'` |
| `src/core/csv.ts` | create | `toCsv` |
| `src/core/cost.ts` | modify | `+ entryCostMYR` |
| `src/core/costs.ts` | create | Ranges, lookup, purchase rows, summary, sorting, totals, CSV row builders |
| `src/core/types.ts` | modify | `Settings`, `LANDING_TABS`, `WEIGHT_UNITS`, `SEXES`, `GOALS` |
| `src/core/backup.ts` | create | Envelope, row guards, integrity, restore plan, preview copy |
| `src/storage/db.ts` | modify | Re-export `Settings` from core |
| `src/storage/backup.ts` | create | `readAllTables`, `exportAll`, `previewRestore`, `applyRestore` |
| `src/storage/__fixtures__/backup-v3.json` | create | The fixture every future version must restore |
| `src/ui/labels.ts` | modify | `+ entryItemName`, which `describeEntry` reuses |
| `src/ui/download.ts` | create | `downloadText` |
| `src/ui/components/RangePicker.tsx` | create | Range control |
| `src/ui/components/TotalsList.tsx` | create | Location and month totals |
| `src/ui/components/PurchaseTable.tsx` | create | Sortable table |
| `src/ui/components/DataPanel.tsx` | create | Exports, backup, restore flow |
| `src/ui/screens/CostsScreen.tsx` | create | The screen |
| `src/ui/App.tsx` | modify | Enable the tab and mount the screen |
| `src/index.css` | modify | Costs styles and `.btn--danger` |

Tests sit beside each file as `*.test.ts(x)`, as elsewhere in the repo.

---

## Task 1: Run the test suite on threads

Phase 3 §5 diagnosed the default `forks` pool as the cause of spurious whole-file failures
on this machine. This is a one-line config change, committed alone so it can be reverted alone.

**Files:**
- Modify: `vite.config.ts` (the `test` block)

- [ ] **Step 1: Change the pool**

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // The forks pool spawns a process per test file, which fails intermittently
    // under load ("Failed to start forks worker") and reports it as a failing
    // suite. Phase 3 execution record §5.
    pool: 'threads',
  },
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: 50 files, 637 tests pass; the build is clean; one lint warning.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: run the test suite on the threads pool"
```

---

## Task 2: `toCsv`

**Files:**
- Create: `src/core/csv.ts`
- Test: `src/core/csv.test.ts`

**Interfaces:**
- Produces: `type CsvCell = string | number | null`;
  `toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

const BOM = '﻿';

describe('toCsv', () => {
  it('starts with a BOM, separates rows with CRLF and ends with one', () => {
    expect(toCsv(['a', 'b'], [['x', 1]])).toBe(`${BOM}a,b\r\nx,1\r\n`);
  });

  it('writes null as an empty cell', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, 'y', null]])).toBe(`${BOM}a,b,c\r\n,y,\r\n`);
  });

  it.each([
    ['a comma', 'Tesco, Setapak', '"Tesco, Setapak"'],
    ['a quote', 'The "good" pasar', '"The ""good"" pasar"'],
    ['a line feed', 'two\nlines', '"two\nlines"'],
    ['a carriage return', 'two\rlines', '"two\rlines"'],
    ['everything at once', 'a,"b"\r\nc', '"a,""b""\r\nc"'],
  ])('quotes a field containing %s', (_, input, expected) => {
    expect(toCsv(['h'], [[input]])).toBe(`${BOM}h\r\n${expected}\r\n`);
  });

  it.each(['=', '+', '-', '@', '\t'])('neutralises a string starting with %j', (prefix) => {
    expect(toCsv(['h'], [[`${prefix}SUM(A1)`]])).toBe(`${BOM}h\r\n'${prefix}SUM(A1)\r\n`);
  });

  it('neutralises a leading carriage return and still quotes it', () => {
    expect(toCsv(['h'], [['\rx']])).toBe(`${BOM}h\r\n"'\rx"\r\n`);
  });

  it('guards before quoting, so a quoted formula is still neutralised', () => {
    expect(toCsv(['h'], [['=1,2']])).toBe(`${BOM}h\r\n"'=1,2"\r\n`);
  });

  it('leaves numbers alone, negative ones included', () => {
    expect(toCsv(['h'], [[-3.5]])).toBe(`${BOM}h\r\n-3.5\r\n`);
  });

  it('refuses a non-finite number rather than writing NaN into a spreadsheet', () => {
    expect(() => toCsv(['h'], [[Number.NaN]])).toThrow(RangeError);
  });

  it('writes headers only when there are no rows', () => {
    expect(toCsv(['a'], [])).toBe(`${BOM}a\r\n`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/csv.test.ts`
Expected: FAIL. `./csv` does not exist.

- [ ] **Step 3: Implement**

```ts
/**
 * CSV written directly, per the parent spec ("no export library"). Knows
 * nothing about the domain: callers round and order, this only serialises.
 */

export type CsvCell = string | number | null;

/**
 * A cell Excel would evaluate as a formula. Ingredient names and locations are
 * free text, and a CSV gets opened on other machines, so "=HYPERLINK(...)"
 * must arrive as text. Applied to strings only: numbers are ours, not typed.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`CSV cell must be finite, got ${value}`);
    return String(value);
  }
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * RFC 4180 with CRLF line endings, plus a UTF-8 byte-order mark: without it
 * Excel reads the file as the system code page and mangles non-ASCII names.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return `﻿${[headers, ...rows].map((row) => `${row.map(cell).join(',')}\r\n`).join('')}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/csv.ts src/core/csv.test.ts
git commit -m "feat: add the CSV serialiser"
```

---

## Task 3: `entryCostMYR`

**Files:**
- Modify: `src/core/cost.ts`
- Test: `src/core/cost.test.ts` (append)

**Interfaces:**
- Consumes: `isSessionEntry`, `entrySessionGrams`, `EPSILON` from `./batch`
- Produces: `entryCostMYR(entry: MealEntry, session: CookSession, batch: Batch): MYR | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/core/cost.test.ts`. Add `entryCostMYR` to the existing `./cost` import and
`EPSILON` from `./batch`. Keep these fixtures local to the new `describe`: the file's own
fixtures may use other numbers.

```ts
describe('entryCostMYR', () => {
  // RM20 for 1kg; 400g of it roasted into 284g, cut into 4 portions of 71g.
  // The cook's share of the price is 20 × 400/1000 = RM8.
  const b: Batch = {
    id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' }, createdAt: 0,
  };
  const s: CookSession = {
    id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
    cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
  };
  const base = { profileId: 'p1', date: '2026-09-19', label: 'lunch' as const, createdAt: 0 };
  const portion = (id: string, portions: number): MealEntry =>
    ({ ...base, id, kind: 'portion', cookSessionId: 's1', portions });
  const weight = (id: string, grams: number): MealEntry =>
    ({ ...base, id, kind: 'weight', cookSessionId: 's1', grams: g(grams) });

  it('prices a portion as its share of the cook', () => {
    expect(entryCostMYR(portion('e1', 1), s, b)).toBeCloseTo(2, 10);
  });

  it('prices a weighed entry by grams over the cooked weight', () => {
    expect(entryCostMYR(weight('e1', 142), s, b)).toBeCloseTo(4, 10);
  });

  it('is null for entries with no purchase behind them', () => {
    expect(entryCostMYR({ ...base, id: 'q', kind: 'quick', name: 'Teh', kcal: 90 }, s, b)).toBeNull();
    expect(entryCostMYR(
      { ...base, id: 'i', kind: 'ingredient', ingredientId: 'rice', method: 'boiled', cookedG: g(100) },
      s, b,
    )).toBeNull();
  });

  it('is null for an entry against a different cook', () => {
    expect(entryCostMYR({ ...portion('e1', 1), cookSessionId: 'other' }, s, b)).toBeNull();
  });

  it('is null when the cook does not belong to the batch', () => {
    expect(entryCostMYR(portion('e1', 1), { ...s, batchId: 'elsewhere' }, b)).toBeNull();
  });

  it('adds up to the cook\'s share of the price once the cook is fully eaten', () => {
    // 2 portions (142g) + 100g + 42g = 284g, the whole cook.
    const entries = [portion('e1', 2), weight('e2', 100), weight('e3', 42)];
    const total = entries.reduce((sum, e) => sum + (entryCostMYR(e, s, b) ?? 0), 0);
    expect(Math.abs(total - 8)).toBeLessThan(EPSILON);
  });
});
```

If `Batch`, `CookSession`, `MealEntry`, `g` or `myr` are not already imported in that file,
add them (`import type { Batch, CookSession, MealEntry } from './types'`,
`import { g, myr } from './units'`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/cost.test.ts`
Expected: FAIL. `entryCostMYR` is not exported.

- [ ] **Step 3: Implement**

In `src/core/cost.ts`, change the imports and append the function:

```ts
import { entrySessionGrams, isSessionEntry, sessionsOf } from './batch';
import type { Batch, CookSession, Ingredient, MealEntry } from './types';
```

```ts
/**
 * What one meal cost: the cook's share of the purchase price, times the share
 * of the cook this entry ate.
 *
 * `entrySessionGrams` is the same helper the remainder derivation uses, so a
 * portion is priced at exactly the grams it removes from the pan. That is what
 * makes a fully eaten cook's entries sum to the cook's price (tested).
 */
export function entryCostMYR(entry: MealEntry, session: CookSession, batch: Batch): MYR | null {
  if (!isSessionEntry(entry) || entry.cookSessionId !== session.id) return null;
  if (session.batchId !== batch.id) return null;
  if (batch.rawWeightG <= 0 || session.cookedWeightG <= 0) return null;
  const sessionPrice = batch.purchase.pricePaidMYR * (session.rawUsedG / batch.rawWeightG);
  return myr(sessionPrice * (entrySessionGrams(entry, session) / session.cookedWeightG));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/core/cost.test.ts`
Expected: PASS, old and new.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/cost.ts src/core/cost.test.ts
git commit -m "feat: price a meal entry from its cook"
```

---

## Task 4: `core/costs.ts`: ranges, lookup, rows, summary

**Files:**
- Create: `src/core/costs.ts`
- Test: `src/core/costs.test.ts`

**Interfaces:**
- Consumes: `costPerKgRaw`, `costPerKgCooked`, `proteinPerMYRRaw`, `proteinPerMYRRetained`
  from `./cost`; `sessionsOf` from `./batch`
- Produces:
  ```ts
  type CostRange = 'thisMonth' | 'last3Months' | 'thisYear' | 'all';
  const COST_RANGES: readonly CostRange[];
  const UNKNOWN_INGREDIENT = 'Unknown ingredient';
  inRange(date: IsoDate, range: CostRange, today: IsoDate): boolean;
  rangeFileTag(range: CostRange, today: IsoDate): string;
  ingredientLookup(bundled: readonly Ingredient[], user: readonly Ingredient[]): (id: string) => Ingredient | undefined;
  interface PurchaseRow { batchId; date; ingredient; location; rawWeightG: Grams; priceMYR: MYR;
    myrPerKgRaw: MYR | null; proteinRawG: number | null; proteinPerMYRRaw: number | null;
    cookedG: Grams | null; myrPerKgCooked: MYR | null; proteinPerMYRCooked: number | null }
  purchaseRows(batches, sessions, ingredientById, retention): PurchaseRow[];
  interface CostSummary { spentMYR: MYR; count: number; proteinPerMYR: number | null }
  summarise(rows: readonly PurchaseRow[]): CostSummary;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  ingredientLookup, inRange, purchaseRows, rangeFileTag, summarise, UNKNOWN_INGREDIENT,
  type CostRange,
} from './costs';
import { zeroNutrients } from './nutrients';
import type { RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient } from './types';
import { g, myr } from './units';

export const ingredient = (id: string, name: string, protein: number, over: Partial<Ingredient> = {}): Ingredient => ({
  id, name, category: 'meat', per100gRaw: { ...zeroNutrients(), protein },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false, ...over,
});

const batch = (id: string, over: Partial<Batch> & { price?: number; date?: string; location?: string } = {}): Batch => {
  const { price = 20, date = '2026-09-19', location = 'Pasar', ...rest } = over;
  return {
    id, ingredientId: 'chicken', rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(price), location, date }, createdAt: 0, ...rest,
  };
};

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false, ...over,
});

const CHICKEN = ingredient('chicken', 'Chicken', 22.5);
const KANGKUNG = ingredient('kangkung', 'Kangkung', 2.6, { category: 'vegetable' });
const RETENTION: RetentionLookup = { meat: { roasted: { protein: 0.9 } } };
const lookup = ingredientLookup([CHICKEN, KANGKUNG], []);

describe('inRange', () => {
  const today = '2026-09-23';
  it.each<[string, CostRange, boolean]>([
    ['2026-09-01', 'thisMonth', true],
    ['2026-09-30', 'thisMonth', true],
    ['2026-08-31', 'thisMonth', false],
    ['2026-07-01', 'last3Months', true],
    ['2026-06-30', 'last3Months', false],
    ['2026-10-01', 'last3Months', false],
    ['2026-01-01', 'thisYear', true],
    ['2025-12-31', 'thisYear', false],
    ['1999-01-01', 'all', true],
  ])('%s in %s is %s', (date, range, expected) => {
    expect(inRange(date, range, today)).toBe(expected);
  });

  it('reaches back across the year boundary for the last three months', () => {
    expect(inRange('2025-11-01', 'last3Months', '2026-01-15')).toBe(true);
    expect(inRange('2025-12-31', 'last3Months', '2026-01-15')).toBe(true);
    expect(inRange('2025-10-31', 'last3Months', '2026-01-15')).toBe(false);
  });
});

describe('rangeFileTag', () => {
  it.each<[CostRange, string, string]>([
    ['thisMonth', '2026-09-23', '2026-09'],
    ['last3Months', '2026-09-23', '2026-07-to-2026-09'],
    ['last3Months', '2026-01-15', '2025-11-to-2026-01'],
    ['thisYear', '2026-09-23', '2026'],
    ['all', '2026-09-23', 'all'],
  ])('%s on %s is %s', (range, today, expected) => {
    expect(rangeFileTag(range, today)).toBe(expected);
  });
});

describe('ingredientLookup', () => {
  it('resolves an archived user ingredient, which the picker catalogue hides', () => {
    const tempeh = ingredient('u-tempeh', 'Tempeh', 20, { source: 'user', archived: true });
    expect(ingredientLookup([CHICKEN], [tempeh])('u-tempeh')?.name).toBe('Tempeh');
  });

  it('lets a user ingredient shadow a bundled one with the same id', () => {
    const mine = ingredient('chicken', 'My chicken', 20, { source: 'user' });
    expect(ingredientLookup([CHICKEN], [mine])('chicken')?.name).toBe('My chicken');
  });
});

describe('purchaseRows', () => {
  it('takes every figure from cost.ts', () => {
    const [row] = purchaseRows([batch('b1')], [session('s1', 'b1')], lookup, RETENTION);
    expect(row).toMatchObject({
      batchId: 'b1', date: '2026-09-19', ingredient: 'Chicken', location: 'Pasar',
      rawWeightG: 1000, priceMYR: 20, myrPerKgRaw: 20, proteinRawG: 225,
      proteinPerMYRRaw: 11.25, cookedG: 284,
    });
    // RM8 attributable over 0.284kg cooked.
    expect(row!.myrPerKgCooked).toBeCloseTo(8 / 0.284, 10);
    // 400g raw × 22.5% protein × 0.9 retained, over RM8.
    expect(row!.proteinPerMYRCooked).toBeCloseTo(10.125, 10);
  });

  it('leaves the cooked figures null for a batch never cooked', () => {
    const [row] = purchaseRows([batch('b1')], [], lookup, RETENTION);
    expect(row).toMatchObject({ cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null });
  });

  it('keeps a batch whose ingredient cannot be resolved, with no protein figures', () => {
    const [row] = purchaseRows([batch('b1', { ingredientId: 'gone' })], [], lookup, RETENTION);
    expect(row).toMatchObject({
      ingredient: UNKNOWN_INGREDIENT, priceMYR: 20, proteinRawG: null, proteinPerMYRRaw: null,
    });
  });

  it('orders rows newest-created first', () => {
    const rows = purchaseRows(
      [batch('old', { createdAt: 1 }), batch('new', { createdAt: 2 })], [], lookup, RETENTION,
    );
    expect(rows.map((r) => r.batchId)).toEqual(['new', 'old']);
  });
});

describe('summarise', () => {
  it('weights protein per RM by spend rather than averaging the rows', () => {
    // Chicken: 225g protein for RM20 (11.25/RM). Kangkung: 13g for RM2 (6.5/RM).
    // Weighted: 238 / 22 = 10.82. The mean of the rows would be 8.875.
    const rows = purchaseRows(
      [batch('c'), batch('k', { ingredientId: 'kangkung', rawWeightG: g(500), price: 2 })],
      [], lookup, RETENTION,
    );
    const s = summarise(rows);
    expect(s.spentMYR).toBe(22);
    expect(s.count).toBe(2);
    expect(s.proteinPerMYR).toBeCloseTo(238 / 22, 10);
  });

  it('counts an unresolvable purchase in the spend but not in the protein ratio', () => {
    const rows = purchaseRows([batch('c'), batch('x', { ingredientId: 'gone', price: 5 })], [], lookup, RETENTION);
    const s = summarise(rows);
    expect(s.spentMYR).toBe(25);
    expect(s.proteinPerMYR).toBeCloseTo(11.25, 10);
  });

  it('has no protein ratio when nothing was spent', () => {
    expect(summarise([]).proteinPerMYR).toBeNull();
    expect(summarise(purchaseRows([batch('c', { price: 0 })], [], lookup, RETENTION)).proteinPerMYR).toBeNull();
  });
});
```

The `ingredient` helper is exported because Tasks 5 and 6 import it from this test file.
Vitest only collects `describe`/`it` from the file under test, so the import is safe.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/costs.test.ts`
Expected: FAIL. `./costs` does not exist.

- [ ] **Step 3: Implement**

```ts
import { sessionsOf } from './batch';
import {
  costPerKgCooked, costPerKgRaw, proteinPerMYRRaw, proteinPerMYRRetained,
} from './cost';
import type { RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient, IsoDate } from './types';
import { g, myr, type Grams, type MYR } from './units';

export type CostRange = 'thisMonth' | 'last3Months' | 'thisYear' | 'all';
export const COST_RANGES: readonly CostRange[] = ['thisMonth', 'last3Months', 'thisYear', 'all'];

export const UNKNOWN_INGREDIENT = 'Unknown ingredient';

/**
 * Months since year 0, so "two months before January" is subtraction. Worked
 * on the date's text rather than through `Date`, so there is no time zone and
 * no rollover to get wrong.
 */
const monthIndex = (iso: IsoDate): number =>
  Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

const monthIso = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** Calendar ranges: "this month" is September, not the last 30 days. */
export function inRange(date: IsoDate, range: CostRange, today: IsoDate): boolean {
  switch (range) {
    case 'all': return true;
    case 'thisYear': return date.slice(0, 4) === today.slice(0, 4);
    case 'thisMonth': return date.slice(0, 7) === today.slice(0, 7);
    case 'last3Months': {
      const back = monthIndex(today) - monthIndex(date);
      return back >= 0 && back <= 2;
    }
  }
}

/** The part of an export's filename that says which range it holds. */
export function rangeFileTag(range: CostRange, today: IsoDate): string {
  switch (range) {
    case 'all': return 'all';
    case 'thisYear': return today.slice(0, 4);
    case 'thisMonth': return today.slice(0, 7);
    case 'last3Months': return `${monthIso(monthIndex(today) - 2)}-to-${today.slice(0, 7)}`;
  }
}

/**
 * Every ingredient a stored row could name, archived ones included.
 *
 * Deliberately not `mergeCatalogue`, which drops archived ingredients because
 * it feeds a picker. A purchase made before its ingredient was archived is
 * still money spent, and must not turn into "Unknown ingredient" here.
 */
export function ingredientLookup(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): (id: string) => Ingredient | undefined {
  const byId = new Map<string, Ingredient>();
  for (const i of bundled) byId.set(i.id, i);
  for (const i of user) byId.set(i.id, i);
  return (id) => byId.get(id);
}

export interface PurchaseRow {
  batchId: string;
  date: IsoDate;
  /** The ingredient's name, or `UNKNOWN_INGREDIENT`. */
  ingredient: string;
  /** As stored; blank is possible. */
  location: string;
  rawWeightG: Grams;
  priceMYR: MYR;
  myrPerKgRaw: MYR | null;
  /** Protein in the whole purchase, raw. Feeds the weighted summary. */
  proteinRawG: number | null;
  proteinPerMYRRaw: number | null;
  /** Null when the batch was never cooked. */
  cookedG: Grams | null;
  myrPerKgCooked: MYR | null;
  proteinPerMYRCooked: number | null;
}

/**
 * One row per batch, newest-created first, which is also the tie order every
 * later sort preserves.
 *
 * Every money and protein figure comes from `cost.ts`, so the table can never
 * disagree with the batch card in Kitchen.
 */
export function purchaseRows(
  batches: readonly Batch[],
  sessions: readonly CookSession[],
  ingredientById: (id: string) => Ingredient | undefined,
  retention: RetentionLookup,
): PurchaseRow[] {
  return [...batches]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((b) => {
      const ing = ingredientById(b.ingredientId);
      const mine = sessionsOf(b.id, sessions);
      return {
        batchId: b.id,
        date: b.purchase.date,
        ingredient: ing?.name ?? UNKNOWN_INGREDIENT,
        location: b.purchase.location,
        rawWeightG: b.rawWeightG,
        priceMYR: b.purchase.pricePaidMYR,
        myrPerKgRaw: costPerKgRaw(b),
        proteinRawG: ing === undefined ? null : (b.rawWeightG / 100) * ing.per100gRaw.protein,
        proteinPerMYRRaw: ing === undefined ? null : proteinPerMYRRaw(b, ing),
        cookedG: mine.length === 0 ? null : g(mine.reduce((sum, s) => sum + s.cookedWeightG, 0)),
        myrPerKgCooked: costPerKgCooked(b, sessions),
        proteinPerMYRCooked: ing === undefined
          ? null
          : proteinPerMYRRetained(b, ing, sessions, retention),
      };
    });
}

export interface CostSummary {
  spentMYR: MYR;
  count: number;
  proteinPerMYR: number | null;
}

/**
 * Protein per RM across a range is total protein over total spend, NOT the
 * mean of each row's figure: a mean would weigh a RM2 bag of kangkung the same
 * as a RM40 chicken. The denominator is the spend on rows whose protein is
 * known, so a purchase of an unresolvable ingredient does not count as money
 * that bought no protein.
 */
export function summarise(rows: readonly PurchaseRow[]): CostSummary {
  let spent = 0;
  let knownSpent = 0;
  let protein = 0;
  for (const r of rows) {
    spent += r.priceMYR;
    if (r.proteinRawG !== null) {
      knownSpent += r.priceMYR;
      protein += r.proteinRawG;
    }
  }
  return {
    spentMYR: myr(spent),
    count: rows.length,
    proteinPerMYR: knownSpent > 0 ? protein / knownSpent : null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/core/costs.test.ts src/core/purity.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/costs.ts src/core/costs.test.ts
git commit -m "feat: build purchase rows and a weighted spending summary"
```

---

## Task 5: `core/costs.ts`: sorting and totals

**Files:**
- Modify: `src/core/costs.ts` (append)
- Test: `src/core/costs.test.ts` (append)

**Interfaces:**
- Consumes: `PurchaseRow` (Task 4)
- Produces:
  ```ts
  type SortKey = 'ingredient' | 'date' | 'location' | 'rawWeightG' | 'priceMYR'
    | 'myrPerKgRaw' | 'proteinPerMYRRaw' | 'proteinPerMYRCooked';
  interface Sort { key: SortKey; dir: 'asc' | 'desc' }
  const DEFAULT_SORT: Sort;          // { key: 'date', dir: 'desc' }
  nextSort(current: Sort, key: SortKey): Sort;
  sortRows(rows: readonly PurchaseRow[], sort: Sort): PurchaseRow[];
  interface TotalRow { key: string; label: string; count: number; spentMYR: MYR; share: number }
  const NO_LOCATION = 'No location';
  totalsByLocation(rows: readonly PurchaseRow[]): TotalRow[];
  totalsByMonth(rows: readonly PurchaseRow[]): TotalRow[];
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/core/costs.test.ts` and extend its `./costs` import with `DEFAULT_SORT`,
`nextSort`, `NO_LOCATION`, `sortRows`, `totalsByLocation`, `totalsByMonth`, `type PurchaseRow`
and `type SortKey`.

```ts
const row = (id: string, over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  batchId: id, date: '2026-09-19', ingredient: 'Chicken', location: 'Pasar',
  rawWeightG: g(1000), priceMYR: myr(20), myrPerKgRaw: myr(20), proteinRawG: 225,
  proteinPerMYRRaw: 11.25, cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null,
  ...over,
});
const ids = (rows: readonly PurchaseRow[]) => rows.map((r) => r.batchId);

describe('nextSort', () => {
  it('reverses the active column', () => {
    expect(nextSort({ key: 'priceMYR', dir: 'desc' }, 'priceMYR')).toEqual({ key: 'priceMYR', dir: 'asc' });
  });
  it('starts a new number or date column descending and a text column ascending', () => {
    expect(nextSort(DEFAULT_SORT, 'priceMYR')).toEqual({ key: 'priceMYR', dir: 'desc' });
    expect(nextSort(DEFAULT_SORT, 'ingredient')).toEqual({ key: 'ingredient', dir: 'asc' });
    expect(nextSort(DEFAULT_SORT, 'location')).toEqual({ key: 'location', dir: 'asc' });
  });
  it('defaults to newest first', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'date', dir: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [
    row('a', { date: '2026-09-02', ingredient: 'banana', location: 'Tesco', priceMYR: myr(5), proteinPerMYRCooked: 3 }),
    row('b', { date: '2026-09-01', ingredient: 'Apple', location: '', priceMYR: myr(9), proteinPerMYRCooked: null }),
    row('c', { date: '2026-09-03', ingredient: 'cherry', location: 'aeon', priceMYR: myr(1), proteinPerMYRCooked: 7 }),
  ];

  const cases: [SortKey, string[], string[]][] = [
    ['date', ['b', 'a', 'c'], ['c', 'a', 'b']],
    ['ingredient', ['b', 'a', 'c'], ['c', 'a', 'b']],
    ['priceMYR', ['c', 'a', 'b'], ['b', 'a', 'c']],
    // Nulls last in BOTH directions.
    ['proteinPerMYRCooked', ['a', 'c', 'b'], ['c', 'a', 'b']],
    // A blank location renders as — and sorts like a null.
    ['location', ['c', 'a', 'b'], ['a', 'c', 'b']],
  ];
  it.each(cases)('sorts by %s both ways', (key, asc, desc) => {
    expect(ids(sortRows(rows, { key, dir: 'asc' }))).toEqual(asc);
    expect(ids(sortRows(rows, { key, dir: 'desc' }))).toEqual(desc);
  });

  it('compares text ignoring case', () => {
    expect(ids(sortRows([row('x', { ingredient: 'b' }), row('y', { ingredient: 'A' })], { key: 'ingredient', dir: 'asc' })))
      .toEqual(['y', 'x']);
  });

  it('keeps ties in their incoming order, in either direction', () => {
    const tied = [row('1'), row('2'), row('3')];
    expect(ids(sortRows(tied, { key: 'date', dir: 'asc' }))).toEqual(['1', '2', '3']);
    expect(ids(sortRows(tied, { key: 'date', dir: 'desc' }))).toEqual(['1', '2', '3']);
  });

  it('does not mutate its input', () => {
    const input = [row('a', { priceMYR: myr(1) }), row('b', { priceMYR: myr(2) })];
    sortRows(input, { key: 'priceMYR', dir: 'desc' });
    expect(ids(input)).toEqual(['a', 'b']);
  });
});

describe('totalsByLocation', () => {
  it('folds case and whitespace, labels with the most recent spelling, and ranks by spend', () => {
    const totals = totalsByLocation([
      row('1', { location: 'tesco ', date: '2026-09-01', priceMYR: myr(10) }),
      row('2', { location: 'Tesco', date: '2026-09-05', priceMYR: myr(5) }),
      row('3', { location: 'Pasar', date: '2026-09-02', priceMYR: myr(30) }),
    ]);
    expect(totals).toEqual([
      { key: 'pasar', label: 'Pasar', count: 1, spentMYR: 30, share: 30 / 45 },
      { key: 'tesco', label: 'Tesco', count: 2, spentMYR: 15, share: 15 / 45 },
    ]);
  });

  it('breaks a same-date spelling tie in favour of the row seen first', () => {
    const [t] = totalsByLocation([
      row('1', { location: 'AEON', date: '2026-09-05' }),
      row('2', { location: 'aeon', date: '2026-09-05' }),
    ]);
    expect(t!.label).toBe('AEON');
  });

  it('groups blank locations under No location', () => {
    const [t] = totalsByLocation([row('1', { location: '' }), row('2', { location: '   ' })]);
    expect(t).toMatchObject({ label: NO_LOCATION, count: 2 });
  });

  it('gives every share as zero when nothing was spent', () => {
    expect(totalsByLocation([row('1', { priceMYR: myr(0) })])[0]!.share).toBe(0);
  });

  it('orders equal spends by label', () => {
    const totals = totalsByLocation([row('1', { location: 'Zed' }), row('2', { location: 'Abe' })]);
    expect(totals.map((t) => t.label)).toEqual(['Abe', 'Zed']);
  });
});

describe('totalsByMonth', () => {
  it('groups by month, newest first, with readable labels', () => {
    const totals = totalsByMonth([
      row('1', { date: '2026-08-30', priceMYR: myr(4) }),
      row('2', { date: '2026-09-01', priceMYR: myr(6) }),
      row('3', { date: '2026-09-20', priceMYR: myr(10) }),
    ]);
    expect(totals.map(({ key, label, count, spentMYR }) => ({ key, label, count, spentMYR }))).toEqual([
      { key: '2026-09', label: 'Sep 2026', count: 2, spentMYR: 16 },
      { key: '2026-08', label: 'Aug 2026', count: 1, spentMYR: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/costs.test.ts`
Expected: FAIL on the new imports.

- [ ] **Step 3: Implement**

Append to `src/core/costs.ts`:

```ts
/** The eight columns the table shows, each of which can be sorted on. */
export type SortKey =
  | 'ingredient' | 'date' | 'location' | 'rawWeightG' | 'priceMYR'
  | 'myrPerKgRaw' | 'proteinPerMYRRaw' | 'proteinPerMYRCooked';

export interface Sort { key: SortKey; dir: 'asc' | 'desc'; }

export const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' };

const TEXT_KEYS: ReadonlySet<SortKey> = new Set<SortKey>(['ingredient', 'location']);

/**
 * Tapping the active column reverses it. A new column starts where it is most
 * useful: biggest numbers and newest dates first, text A→Z.
 */
export const nextSort = (current: Sort, key: SortKey): Sort =>
  current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: TEXT_KEYS.has(key) ? 'asc' : 'desc' };

/** A blank location is shown as — and so sorts with the missing values. */
const sortValue = (row: PurchaseRow, key: SortKey): string | number | null =>
  key === 'location' && row.location.trim() === '' ? null : row[key];

function compare(key: SortKey, a: string | number, b: string | number): number {
  if (typeof a === 'string' && typeof b === 'string') {
    if (TEXT_KEYS.has(key)) return a.localeCompare(b, undefined, { sensitivity: 'base' });
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return (a as number) - (b as number);
}

/**
 * Missing values sort last in BOTH directions. Otherwise a descending sort on
 * cooked protein per RM would put every uncooked batch at the top, which is
 * the opposite of what that sort is for. Ties keep their incoming order.
 */
export function sortRows(rows: readonly PurchaseRow[], sort: Sort): PurchaseRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValue(row, sort.key) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return sign * compare(sort.key, a.value, b.value) || a.index - b.index;
    })
    .map(({ row }) => row);
}

export interface TotalRow {
  key: string;
  label: string;
  count: number;
  spentMYR: MYR;
  /** Of the whole range's spend, 0–1. Zero everywhere when nothing was spent. */
  share: number;
}

export const NO_LOCATION = 'No location';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Group { label: string; labelDate: IsoDate; count: number; spent: number; }

function totalsBy(
  rows: readonly PurchaseRow[],
  keyOf: (r: PurchaseRow) => string,
  labelOf: (r: PurchaseRow, key: string) => string,
): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = keyOf(r);
    const hit = groups.get(key);
    if (hit === undefined) {
      groups.set(key, { label: labelOf(r, key), labelDate: r.date, count: 1, spent: r.priceMYR });
      continue;
    }
    hit.count += 1;
    hit.spent += r.priceMYR;
    // Strictly later only: on a tie the row seen first keeps the label, and
    // rows arrive newest-created first.
    if (r.date > hit.labelDate) {
      hit.label = labelOf(r, key);
      hit.labelDate = r.date;
    }
  }
  return groups;
}

function toTotals(groups: Map<string, Group>): TotalRow[] {
  const total = [...groups.values()].reduce((sum, grp) => sum + grp.spent, 0);
  return [...groups].map(([key, grp]) => ({
    key, label: grp.label, count: grp.count, spentMYR: myr(grp.spent),
    share: total > 0 ? grp.spent / total : 0,
  }));
}

/**
 * "Tesco" and "tesco " are the same shop typed twice, so they are one row,
 * labelled the way it was spelled most recently.
 */
export function totalsByLocation(rows: readonly PurchaseRow[]): TotalRow[] {
  const groups = totalsBy(
    rows,
    (r) => r.location.trim().toLocaleLowerCase(),
    (r, key) => (key === '' ? NO_LOCATION : r.location.trim()),
  );
  return toTotals(groups).sort((a, b) => b.spentMYR - a.spentMYR || a.label.localeCompare(b.label));
}

export function totalsByMonth(rows: readonly PurchaseRow[]): TotalRow[] {
  const groups = totalsBy(
    rows,
    (r) => r.date.slice(0, 7),
    (_, key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
  );
  return toTotals(groups).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/core/costs.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/costs.ts src/core/costs.test.ts
git commit -m "feat: sort purchases and total them by location and month"
```

---

## Task 6: CSV row builders and `entryItemName`

**Files:**
- Modify: `src/ui/labels.ts` (extract `entryItemName` out of `describeEntry`)
- Modify: `src/core/costs.ts` (append the builders)
- Test: `src/ui/labels.test.ts` (append), `src/core/costs.test.ts` (append)

**Interfaces:**
- Consumes: `CsvCell` (Task 2), `entryCostMYR` (Task 3), `PurchaseRow` (Task 4),
  `entryNutrients` + `MealContext` from `./meals`, `isSessionEntry` + `portionsToGrams` from `./batch`
- Produces:
  ```ts
  // ui/labels.ts
  entryItemName(entry: MealEntry, ctx: MealContext): string;
  // core/costs.ts
  const PURCHASE_CSV_HEADERS: readonly string[];
  const MEAL_CSV_HEADERS: readonly string[];
  const UNKNOWN_PROFILE = 'Unknown profile';
  purchaseCsvRows(rows: readonly PurchaseRow[]): CsvCell[][];
  interface MealCsvNames { profileName: (id: string) => string | undefined; itemName: (e: MealEntry) => string }
  mealCsvRows(entries: readonly MealEntry[], ctx: MealContext, names: MealCsvNames): CsvCell[][];
  ```

- [ ] **Step 1: Write the failing tests for `entryItemName`**

Append to `src/ui/labels.test.ts` and add `entryItemName` to its `./labels` import. The
file's existing `ctx` and `entry()` fixtures are used as they are.

```ts
describe('entryItemName', () => {
  it.each<[string, Partial<MealEntry>, string]>([
    ['quick', { kind: 'quick', name: 'Teh tarik', kcal: 180 }, 'Teh tarik'],
    ['ingredient', { kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) }, 'Chicken breast, roasted'],
    ['weight', { kind: 'weight', cookSessionId: 's1', grams: g(142) }, 'Chicken breast, roasted'],
    ['portion', { kind: 'portion', cookSessionId: 's1', portions: 2 }, 'Chicken breast, roasted'],
    ['missing cook', { kind: 'portion', cookSessionId: 'gone', portions: 1 }, 'A cook that is no longer in your kitchen'],
    ['unknown ingredient', { kind: 'weight', cookSessionId: 's2', grams: g(50) }, 'Unknown ingredient, boiled'],
  ])('names a %s entry without its amount', (_, over, expected) => {
    expect(entryItemName(entry(over), ctx)).toBe(expected);
  });

  it('is always the start of the Log description, so the two cannot disagree', () => {
    const kinds: Partial<MealEntry>[] = [
      { kind: 'quick', name: 'Teh tarik', kcal: 180 },
      { kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(142) },
      { kind: 'weight', cookSessionId: 's1', grams: g(142) },
      { kind: 'portion', cookSessionId: 's1', portions: 1 },
    ];
    for (const over of kinds) {
      const e = entry(over);
      expect(describeEntry(e, ctx).startsWith(entryItemName(e, ctx))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Extract `entryItemName`**

Replace `describeEntry` in `src/ui/labels.ts` with the pair below. The output of
`describeEntry` must be byte-identical to before; the existing `describeEntry` tests prove it.

```ts
/**
 * What an entry is, without how much of it: "Chicken breast, skinless, roasted".
 * Split out of `describeEntry` so the meals CSV, which has its own amount
 * columns, names items exactly as the Log does.
 */
export function entryItemName(entry: MealEntry, ctx: MealContext): string {
  if (entry.kind === 'quick') return entry.name;

  if (entry.kind === 'ingredient') {
    const name = ctx.ingredientById(entry.ingredientId)?.name ?? 'Unknown ingredient';
    return `${name}, ${METHOD_LABELS[entry.method].toLowerCase()}`;
  }

  const session = ctx.sessions.find((s) => s.id === entry.cookSessionId);
  if (session === undefined) return 'A cook that is no longer in your kitchen';

  const batch = ctx.batches.find((b) => b.id === session.batchId);
  const name = (batch === undefined ? undefined : ctx.ingredientById(batch.ingredientId)?.name)
    ?? 'Unknown ingredient';
  return `${name}, ${METHOD_LABELS[session.method].toLowerCase()}`;
}

/**
 * What an entry says on the Log. Lives beside METHOD_LABELS rather than in the
 * component so the four kinds are described in one place and read consistently.
 */
export function describeEntry(entry: MealEntry, ctx: MealContext): string {
  const name = entryItemName(entry, ctx);
  if (entry.kind === 'quick') return `${name} (quick)`;
  if (entry.kind === 'ingredient') return `${name} — ${formatG(entry.cookedG)}`;

  if (!ctx.sessions.some((s) => s.id === entry.cookSessionId)) return name;

  const amount = entry.kind === 'portion'
    ? `${entry.portions} portion${entry.portions === 1 ? '' : 's'}`
    : formatG(entry.grams);
  return `${name} — ${amount}`;
}
```

Run: `npx vitest run src/ui/labels.test.ts`
Expected: PASS, the old `describeEntry` tests included.

- [ ] **Step 3: Write the failing tests for the builders**

Append to `src/core/costs.test.ts`. Extend the `./costs` import with `MEAL_CSV_HEADERS`,
`mealCsvRows`, `PURCHASE_CSV_HEADERS`, `purchaseCsvRows` and `UNKNOWN_PROFILE`, and add:

```ts
import { CATEGORY_YIELD } from '../data/categoryYield';
import type { MealContext } from './meals';
import type { MealEntry } from './types';
```

```ts
describe('purchaseCsvRows', () => {
  it('has the documented header', () => {
    expect(PURCHASE_CSV_HEADERS).toEqual([
      'date', 'ingredient', 'location', 'raw_weight_g', 'price_myr', 'myr_per_kg_raw',
      'protein_g_per_myr_raw', 'cooked_g', 'myr_per_kg_cooked', 'protein_g_per_myr_cooked',
      'batch_id',
    ]);
  });

  it('rounds each figure and writes missing ones as null', () => {
    const [r] = purchaseCsvRows([row('b1', {
      rawWeightG: g(1000.04), priceMYR: myr(18.499), myrPerKgRaw: myr(18.499),
      proteinPerMYRRaw: 12.1666, cookedG: g(284.06), myrPerKgCooked: myr(28.1690),
      proteinPerMYRCooked: null,
    })]);
    expect(r).toEqual([
      '2026-09-19', 'Chicken', 'Pasar', 1000, 18.5, 18.5, 12.17, 284.1, 28.17, null, 'b1',
    ]);
  });

  it('keeps the order it is given', () => {
    const rows = purchaseCsvRows([row('z'), row('a')]);
    expect(rows.map((r) => r.at(-1))).toEqual(['z', 'a']);
  });
});

describe('mealCsvRows', () => {
  // 400g chicken (22.5g protein, 120 kcal /100g) roasted to 284g in 4 portions.
  // No retention, so one portion (71g) is exactly a quarter: 22.5g protein, 120 kcal.
  const chicken = ingredient('chicken', 'Chicken', 22.5, {
    per100gRaw: { ...zeroNutrients(), protein: 22.5, kcal: 120 },
  });
  const b = batch('b1');
  const s = session('s1', 'b1');
  const ctx: MealContext = {
    sessions: [s], batches: [b], ingredientById: ingredientLookup([chicken], []),
    samples: [], categoryYield: CATEGORY_YIELD, retention: {},
  };
  const base = { profileId: 'p1', date: '2026-09-19', label: 'lunch' as const, createdAt: 0 };
  const names = {
    profileName: (id: string) => ({ p1: 'Ali', p2: 'Bee' } as Record<string, string>)[id],
    itemName: (e: MealEntry) => `item:${e.id}`,
  };

  it('has the documented header', () => {
    expect(MEAL_CSV_HEADERS).toEqual([
      'date', 'profile', 'meal', 'kind', 'item', 'cooked_g', 'portions', 'kcal', 'protein_g',
      'cost_myr', 'batch_id',
    ]);
  });

  it('writes a portion entry with grams, nutrients, cost and its batch', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'e1', kind: 'portion', cookSessionId: 's1', portions: 1 }], ctx, names,
    );
    expect(r).toEqual(['2026-09-19', 'Ali', 'lunch', 'portion', 'item:e1', 71, 1, 120, 22.5, 2, 'b1']);
  });

  it('writes a weighed entry with no portion count', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'e1', kind: 'weight', cookSessionId: 's1', grams: g(142) }], ctx, names,
    );
    expect(r).toEqual(['2026-09-19', 'Ali', 'lunch', 'weight', 'item:e1', 142, null, 240, 45, 4, 'b1']);
  });

  it('leaves cost and batch empty for entries with no purchase behind them', () => {
    const [r] = mealCsvRows(
      [{ ...base, id: 'i1', kind: 'ingredient', ingredientId: 'chicken', method: 'roasted', cookedG: g(100) }],
      ctx, names,
    );
    expect(r!.slice(5, 7)).toEqual([100, null]);
    expect(r!.slice(9)).toEqual([null, null]);
  });

  it('leaves protein empty, not zero, for a quick entry with no protein figure', () => {
    const [withP, without] = mealCsvRows([
      { ...base, id: 'q1', kind: 'quick', name: 'Teh', kcal: 90, proteinG: 3 },
      { ...base, id: 'q2', kind: 'quick', name: 'Kuih', kcal: 150, createdAt: 1 },
    ], ctx, names);
    expect(withP!.slice(5)).toEqual([null, null, 90, 3, null, null]);
    expect(without!.slice(5)).toEqual([null, null, 150, null, null, null]);
  });

  it('orders by date, then profile name, then meal slot, then creation', () => {
    const rows = mealCsvRows([
      { ...base, id: 'late', date: '2026-09-20', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'bee', profileId: 'p2', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'dinner', label: 'dinner', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'lunch2', createdAt: 2, kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'breakfast', label: 'breakfast', kind: 'quick', name: 'x', kcal: 1 },
      { ...base, id: 'lunch1', createdAt: 1, kind: 'quick', name: 'x', kcal: 1 },
    ], ctx, names);
    expect(rows.map((r) => r[4])).toEqual([
      'item:breakfast', 'item:lunch1', 'item:lunch2', 'item:dinner', 'item:bee', 'item:late',
    ]);
  });

  it('names an unresolvable profile rather than dropping the row', () => {
    const [r] = mealCsvRows([{ ...base, id: 'q', profileId: 'gone', kind: 'quick', name: 'x', kcal: 1 }], ctx, names);
    expect(r![1]).toBe(UNKNOWN_PROFILE);
  });
});
```

Note on the `lunch1`/`lunch2` fixture: the base `createdAt` is 0, and `bee`, `dinner` and
`breakfast` override only what they need. `lunch1` (1) and `lunch2` (2) must come after
`breakfast` and before `dinner`, which is what the expected order says.

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/core/costs.test.ts`
Expected: FAIL on the new imports.

- [ ] **Step 5: Implement**

Add to the imports at the top of `src/core/costs.ts`:

```ts
import { isSessionEntry, portionsToGrams, sessionsOf } from './batch';
import { costPerKgCooked, costPerKgRaw, entryCostMYR, proteinPerMYRRaw, proteinPerMYRRetained } from './cost';
import type { CsvCell } from './csv';
import { entryNutrients, type MealContext } from './meals';
import { MEAL_LABEL_KEYS, type Batch, type CookSession, type Ingredient, type IsoDate, type MealEntry } from './types';
```

(These replace the Task 4 lines for `./batch`, `./cost` and `./types`.) Then append:

```ts
/**
 * Rounding happens here, once, rather than in `toCsv` or the spreadsheet:
 * grams to 0.1, money and ratios to 0.01, kcal whole, protein to 0.1.
 */
const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const roundOrNull = (n: number | null, dp: number): number | null =>
  n === null ? null : round(n, dp);

export const PURCHASE_CSV_HEADERS: readonly string[] = [
  'date', 'ingredient', 'location', 'raw_weight_g', 'price_myr', 'myr_per_kg_raw',
  'protein_g_per_myr_raw', 'cooked_g', 'myr_per_kg_cooked', 'protein_g_per_myr_cooked',
  'batch_id',
];

/** In the order given, which is the table's current sort. */
export function purchaseCsvRows(rows: readonly PurchaseRow[]): CsvCell[][] {
  return rows.map((r) => [
    r.date, r.ingredient, r.location,
    round(r.rawWeightG, 1), round(r.priceMYR, 2),
    roundOrNull(r.myrPerKgRaw, 2), roundOrNull(r.proteinPerMYRRaw, 2),
    roundOrNull(r.cookedG, 1), roundOrNull(r.myrPerKgCooked, 2),
    roundOrNull(r.proteinPerMYRCooked, 2),
    r.batchId,
  ]);
}

export const MEAL_CSV_HEADERS: readonly string[] = [
  'date', 'profile', 'meal', 'kind', 'item', 'cooked_g', 'portions', 'kcal', 'protein_g',
  'cost_myr', 'batch_id',
];

export const UNKNOWN_PROFILE = 'Unknown profile';

/**
 * Names come from outside `core/`: profile names are stored data, and item
 * names use the UI's method labels. Passed in, as `MealContext` passes in
 * ingredients.
 */
export interface MealCsvNames {
  profileName: (profileId: string) => string | undefined;
  itemName: (entry: MealEntry) => string;
}

const LABEL_ORDER = new Map(MEAL_LABEL_KEYS.map((label, i) => [label, i]));

function eatenG(entry: MealEntry, session: CookSession | undefined): number | null {
  switch (entry.kind) {
    case 'portion': return session === undefined ? null : portionsToGrams(session, entry.portions);
    case 'weight': return entry.grams;
    case 'ingredient': return entry.cookedG;
    case 'quick': return null;
  }
}

/**
 * Nutrients come from `entryNutrients`, the Log's own arithmetic, so the file
 * and the screen cannot disagree. A quick entry with no protein figure writes
 * an empty cell: "unknown" and "zero" are different answers.
 */
export function mealCsvRows(
  entries: readonly MealEntry[],
  ctx: MealContext,
  names: MealCsvNames,
): CsvCell[][] {
  const profile = (e: MealEntry) => names.profileName(e.profileId) ?? UNKNOWN_PROFILE;
  const ordered = [...entries].sort((a, b) =>
    a.date.localeCompare(b.date)
    || profile(a).localeCompare(profile(b))
    || LABEL_ORDER.get(a.label)! - LABEL_ORDER.get(b.label)!
    || a.createdAt - b.createdAt);

  return ordered.map((e) => {
    const session = isSessionEntry(e) ? ctx.sessions.find((s) => s.id === e.cookSessionId) : undefined;
    const batch: Batch | undefined = session === undefined
      ? undefined
      : ctx.batches.find((b) => b.id === session.batchId);
    const nutrients = entryNutrients(e, ctx);
    return [
      e.date, profile(e), e.label, e.kind, names.itemName(e),
      roundOrNull(eatenG(e, session), 1),
      e.kind === 'portion' ? e.portions : null,
      round(nutrients.kcal, 0),
      e.kind === 'quick' && e.proteinG === undefined ? null : round(nutrients.protein, 1),
      session !== undefined && batch !== undefined ? roundOrNull(entryCostMYR(e, session, batch), 2) : null,
      batch?.id ?? null,
    ];
  });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/core/costs.test.ts src/ui/labels.test.ts src/core/purity.test.ts`
Expected: PASS.

- [ ] **Step 7: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/costs.ts src/core/costs.test.ts src/ui/labels.ts src/ui/labels.test.ts
git commit -m "feat: build the purchases and meals CSV rows"
```

---
## Task 7: Backup envelope and row guards

**Files:**
- Modify: `src/core/types.ts` (`Settings` and four constant lists)
- Modify: `src/storage/db.ts` (import `Settings` from core and re-export it)
- Create: `src/core/backup.ts`
- Test: `src/core/backup.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/types.ts
  const SEXES: readonly ['male', 'female'];          type Sex = (typeof SEXES)[number];
  const GOALS: readonly ['cut', 'maintain', 'bulk'];  type Goal = (typeof GOALS)[number];
  const LANDING_TABS: readonly ['log', 'kitchen', 'calc'];
  const WEIGHT_UNITS: readonly ['g', 'kg'];
  interface Settings { id: 'singleton'; activeProfileId: string | null;
    landingTab: (typeof LANDING_TABS)[number]; defaultWeightUnit: (typeof WEIGHT_UNITS)[number] }
  // core/backup.ts
  const BACKUP_APP = 'ingcalc'; const CURRENT_SCHEMA_VERSION = 3;
  const MAX_BACKUP_BYTES = 20 * 1024 * 1024; const MAX_MESSAGE_LINES = 5;
  const NOT_READABLE, NOT_OURS, TOO_NEW, TOO_LARGE: string;   // exact copy below
  const TABLE_NAMES: readonly [...7 names]; type TableName;
  interface BackupTables { profiles: Profile[]; userIngredients: Ingredient[]; settings: Settings[];
    batches: Batch[]; cookSessions: CookSession[]; mealEntries: MealEntry[]; dayLogs: DayLog[] }
  interface BackupFile { app: 'ingcalc'; schemaVersion: number; exportedAt: string; tables: BackupTables }
  type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
  emptyTables(): BackupTables;
  makeBackup(tables: BackupTables, now: Date): BackupFile;
  isIsoDate(v: unknown): boolean;
  parseBackup(text: string): Result<BackupTables>;
  ```
  Task 8 also uses the module-private `problems()` collector and `Phrase` type defined here.

- [ ] **Step 1: Move `Settings` into core**

In `src/core/types.ts`, replace the two type lines for `Sex` and `Goal`:

```ts
export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
export const GOALS = ['cut', 'maintain', 'bulk'] as const;
export type Goal = (typeof GOALS)[number];
```

and append:

```ts
export const LANDING_TABS = ['log', 'kitchen', 'calc'] as const;
export const WEIGHT_UNITS = ['g', 'kg'] as const;

/**
 * Lives in `core/` (not beside the Dexie table) because a backup file carries
 * the settings row, and the backup validator is pure.
 */
export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: (typeof LANDING_TABS)[number];
  defaultWeightUnit: (typeof WEIGHT_UNITS)[number];
}
```

In `src/storage/db.ts`, delete the `Settings` interface, add `Settings` to the existing
`../core/types` type import, and below the imports add:

```ts
export type { Settings };
```

Run: `npm run build && npx vitest run src/storage`
Expected: clean build; storage tests pass. `storage/settings.ts` still imports from `./db`.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION, emptyTables, isIsoDate, makeBackup, MAX_MESSAGE_LINES,
  NOT_OURS, NOT_READABLE, parseBackup, TOO_NEW,
} from './backup';
import { zeroNutrients } from './nutrients';

const envelope = (tables: Record<string, unknown>, over: Record<string, unknown> = {}): string =>
  JSON.stringify({ app: 'ingcalc', schemaVersion: 3, exportedAt: '2026-09-23T00:00:00.000Z', tables, ...over });

const purchase = { pricePaidMYR: 20, location: 'Pasar', date: '2026-09-19' };
const targets = { kcal: 2400, proteinG: 130, micros: { iron: { rni: 14, dv: 18 } } };
const entryBase = { id: 'e1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1 };

const VALID = {
  profiles: { id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' },
  userIngredients: {
    id: 'u1', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
    publishedYield: { steamed: 1 }, absorbsWater: false, source: 'user', archived: true,
  },
  settings: { id: 'singleton', activeProfileId: 'p1', landingTab: 'log', defaultWeightUnit: 'g' },
  batches: { id: 'b1', ingredientId: 'chicken-breast', rawWeightG: 1000, purchase, createdAt: 1 },
  cookSessions: {
    id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: 400, cookedWeightG: 284,
    cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
  },
  dayLogs: { id: 'p1:2026-09-19', profileId: 'p1', date: '2026-09-19', targets },
} as const;

const ENTRIES = {
  portion: { ...entryBase, kind: 'portion', cookSessionId: 's1', portions: 1 },
  weight: { ...entryBase, kind: 'weight', cookSessionId: 's1', grams: 100 },
  ingredient: { ...entryBase, kind: 'ingredient', ingredientId: 'kangkung', method: 'boiled', cookedG: 150 },
  quick: { ...entryBase, kind: 'quick', name: 'Teh tarik', kcal: 120 },
} as const;

const errorsFor = (table: string, row: unknown): string[] => {
  const r = parseBackup(envelope({ [table]: [row] }));
  return r.ok ? [] : r.errors;
};

describe('parseBackup: envelope', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, errors: [NOT_READABLE] });
  });

  it.each([
    ['another app', { app: 'other' }],
    ['a missing version', { schemaVersion: undefined }],
    ['a fractional version', { schemaVersion: 2.5 }],
    ['a zero version', { schemaVersion: 0 }],
    ['missing tables', { tables: undefined }],
    ['tables as a list', { tables: [] }],
  ])('rejects %s', (_, over) => {
    expect(parseBackup(envelope({}, over))).toEqual({ ok: false, errors: [NOT_OURS] });
  });

  it('rejects a file from a newer schema', () => {
    expect(parseBackup(envelope({}, { schemaVersion: CURRENT_SCHEMA_VERSION + 1 })))
      .toEqual({ ok: false, errors: [TOO_NEW] });
  });

  it('accepts an older schema and treats its missing tables as empty', () => {
    const r = parseBackup(envelope({ profiles: [VALID.profiles] }, { schemaVersion: 1 }));
    expect(r).toEqual({ ok: true, value: { ...emptyTables(), profiles: [VALID.profiles] } });
  });

  it('ignores tables it does not know', () => {
    expect(parseBackup(envelope({ recipes: [{ id: 'x' }] })).ok).toBe(true);
  });

  it('rejects a table that is not a list', () => {
    expect(parseBackup(envelope({ batches: { id: 'b1' } })))
      .toEqual({ ok: false, errors: ["The backup's purchases are not a list."] });
  });

  it('accepts one valid row of every table and every entry kind', () => {
    const r = parseBackup(envelope({
      ...Object.fromEntries(Object.entries(VALID).map(([t, row]) => [t, [row]])),
      mealEntries: Object.values(ENTRIES).map((e, i) => ({ ...e, id: `e${i}` })),
    }));
    expect(r.ok).toBe(true);
  });
});

describe('parseBackup: each guard rejects each field it checks', () => {
  // [table, noun, label, patch]. Each breaks exactly one field of a valid row.
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['profiles', 'profile', 'id', { id: '' }],
    ['profiles', 'profile', 'name', { name: '   ' }],
    ['profiles', 'profile', 'sex', { sex: 'other' }],
    ['profiles', 'profile', 'birth year', { birthYear: 1995.5 }],
    ['profiles', 'profile', 'height', { heightCm: 0 }],
    ['profiles', 'profile', 'weight', { weightKg: -1 }],
    ['profiles', 'profile', 'sessions per week', { sessionsPerWeek: -1 }],
    ['profiles', 'profile', 'goal', { goal: 'shred' }],
    ['profiles', 'profile', 'protein target', { proteinGPerKg: 0 }],
    ['userIngredients', 'added ingredient', 'id', { id: 3 }],
    ['userIngredients', 'added ingredient', 'name', { name: '' }],
    ['userIngredients', 'added ingredient', 'category', { category: 'candy' }],
    ['userIngredients', 'added ingredient', 'nutrients', { per100gRaw: { protein: 20 } }],
    ['userIngredients', 'added ingredient', 'published yields', { publishedYield: { microwaved: 0.9 } }],
    ['userIngredients', 'added ingredient', 'published yields', { publishedYield: { steamed: 0 } }],
    ['userIngredients', 'added ingredient', 'water absorption', { absorbsWater: 'no' }],
    ['userIngredients', 'added ingredient', 'source', { source: 'usda' }],
    ['userIngredients', 'added ingredient', 'source reference', { sourceRef: 5 }],
    ['userIngredients', 'added ingredient', 'archived flag', { archived: 1 }],
    ['settings', 'settings row', 'id', { id: 'other' }],
    ['settings', 'settings row', 'active profile', { activeProfileId: '' }],
    ['settings', 'settings row', 'landing tab', { landingTab: 'costs' }],
    ['settings', 'settings row', 'weight unit', { defaultWeightUnit: 'lb' }],
    ['batches', 'purchase', 'id', { id: '' }],
    ['batches', 'purchase', 'ingredient', { ingredientId: '' }],
    ['batches', 'purchase', 'weight', { rawWeightG: 0 }],
    ['batches', 'purchase', 'price', { purchase: { ...purchase, pricePaidMYR: -1 } }],
    ['batches', 'purchase', 'location', { purchase: { ...purchase, location: null } }],
    ['batches', 'purchase', 'date', { purchase: { ...purchase, date: '2026-02-30' } }],
    ['batches', 'purchase', 'creation time', { createdAt: 'x' }],
    ['cookSessions', 'cook', 'purchase', { batchId: '' }],
    ['cookSessions', 'cook', 'cooking method', { method: 'microwaved' }],
    ['cookSessions', 'cook', 'raw weight', { rawUsedG: 0 }],
    ['cookSessions', 'cook', 'cooked weight', { cookedWeightG: -5 }],
    ['cookSessions', 'cook', 'date', { cookedAt: '19/09/2026' }],
    ['cookSessions', 'cook', 'portion count', { portionCount: 1.5 }],
    ['cookSessions', 'cook', 'calibration flag', { excludeFromCalibration: 'yes' }],
    ['dayLogs', 'day record', 'profile-and-date id', { id: 'p1:2026-09-20' }],
    ['dayLogs', 'day record', 'date', { date: '2026-09-31', id: 'p1:2026-09-31' }],
    ['dayLogs', 'day record', 'calorie target', { targets: { ...targets, kcal: -1 } }],
    ['dayLogs', 'day record', 'protein target', { targets: { ...targets, proteinG: 'x' } }],
    ['dayLogs', 'day record', 'nutrient targets', { targets: { ...targets, micros: { iron: { rni: 'x' } } } }],
  ];
  it.each(cases)('%s: %s has an invalid %s', (table, noun, label, patch) => {
    const row = { ...VALID[table as keyof typeof VALID], ...patch };
    expect(errorsFor(table, row)).toContain(`1 ${noun} has an invalid ${label}.`);
  });

  const entryCases: [keyof typeof ENTRIES, string, Record<string, unknown>][] = [
    ['quick', 'id', { id: '' }],
    ['quick', 'profile', { profileId: '' }],
    ['quick', 'date', { date: '2026-13-01' }],
    ['quick', 'meal', { label: 'brunch' }],
    ['quick', 'creation time', { createdAt: null }],
    ['quick', 'kind', { kind: 'drink' }],
    ['portion', 'cook', { cookSessionId: '' }],
    ['portion', 'portion count', { portions: 0 }],
    ['weight', 'cook', { cookSessionId: 7 }],
    ['weight', 'weight', { grams: 0 }],
    ['ingredient', 'ingredient', { ingredientId: '' }],
    ['ingredient', 'cooking method', { method: 'raw' }],
    ['ingredient', 'weight', { cookedG: -1 }],
    ['quick', 'name', { name: ' ' }],
    ['quick', 'calorie figure', { kcal: 0 }],
    ['quick', 'protein figure', { proteinG: -1 }],
  ];
  it.each(entryCases)('a %s meal entry has an invalid %s', (kind, label, patch) => {
    expect(errorsFor('mealEntries', { ...ENTRIES[kind], ...patch }))
      .toContain(`1 meal entry has an invalid ${label}.`);
  });

  it('rejects a row that is not an object', () => {
    expect(errorsFor('profiles', 'Ali')).toEqual(['1 profile has an invalid format.']);
  });
});

describe('parseBackup: whole-table checks and reporting', () => {
  it('rejects duplicate ids within a table', () => {
    const r = parseBackup(envelope({ profiles: [VALID.profiles, VALID.profiles] }));
    expect(r).toEqual({ ok: false, errors: ['1 profile has the same id as another.'] });
  });

  it('rejects more than one settings row', () => {
    const r = parseBackup(envelope({ settings: [VALID.settings, { ...VALID.settings, id: 'x' }] }));
    expect(r.ok ? [] : r.errors).toContain('The backup has more than one settings row.');
  });

  it('counts rows with the same problem into one plural line', () => {
    const bad = [1, 2, 3].map((i) => ({ ...ENTRIES.quick, id: `e${i}`, date: 'soon' }));
    expect(parseBackup(envelope({ mealEntries: bad })))
      .toEqual({ ok: false, errors: ['3 meal entries have an invalid date.'] });
  });

  it('caps the report and says how much it left out', () => {
    const r = parseBackup(envelope({
      profiles: [{ ...VALID.profiles, name: '', sex: 'x', goal: 'x', heightCm: 0, weightKg: 0, birthYear: 'x', sessionsPerWeek: -1 }],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(MAX_MESSAGE_LINES);
    expect(r.errors.at(-1)).toBe('…and 3 more problems.');
  });
});

describe('isIsoDate', () => {
  it.each([
    ['2026-09-23', true], ['2024-02-29', true], ['2000-02-29', true],
    ['2026-02-29', false], ['1900-02-29', false], ['2026-04-31', false],
    ['2026-00-10', false], ['2026-9-3', false], ['2026-09-23T00:00', false], [20260923, false],
  ])('%s is %s', (v, expected) => {
    expect(isIsoDate(v)).toBe(expected);
  });
});

describe('makeBackup', () => {
  it('stamps the app, the current schema and the instant', () => {
    const f = makeBackup(emptyTables(), new Date('2026-09-23T01:02:03.000Z'));
    expect(f).toEqual({
      app: 'ingcalc', schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: '2026-09-23T01:02:03.000Z', tables: emptyTables(),
    });
  });
});
```

The "caps the report" profile breaks 7 fields, which gives 7 lines. `lines()` shows
`MAX_MESSAGE_LINES - 1` = 4 of them and reports the other 3.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/core/backup.test.ts`
Expected: FAIL. `./backup` does not exist.

- [ ] **Step 4: Implement**

```ts
import {
  CATEGORIES, COOK_METHODS, GOALS, LANDING_TABS, MEAL_LABEL_KEYS, NUTRIENT_KEYS, SEXES,
  WEIGHT_UNITS,
  type Batch, type CookSession, type DayLog, type Ingredient, type MealEntry, type Profile,
  type Settings,
} from './types';

export const BACKUP_APP = 'ingcalc';
/** Must equal the highest `this.version(n)` in `storage/db.ts`; a test asserts it. */
export const CURRENT_SCHEMA_VERSION = 3;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_MESSAGE_LINES = 5;

export const NOT_READABLE = "This isn't a readable backup file.";
export const NOT_OURS = "This isn't an IngCalc backup.";
export const TOO_NEW = 'This backup was made by a newer version of IngCalc. Update the app, then restore.';
export const TOO_LARGE = 'That file is too large to be an IngCalc backup.';

export const TABLE_NAMES = [
  'profiles', 'userIngredients', 'settings', 'batches', 'cookSessions', 'mealEntries', 'dayLogs',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export interface BackupTables {
  profiles: Profile[];
  userIngredients: Ingredient[];
  settings: Settings[];
  batches: Batch[];
  cookSessions: CookSession[];
  mealEntries: MealEntry[];
  dayLogs: DayLog[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  /** An instant, informational only. */
  exportedAt: string;
  tables: BackupTables;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const emptyTables = (): BackupTables => ({
  profiles: [], userIngredients: [], settings: [], batches: [], cookSessions: [],
  mealEntries: [], dayLogs: [],
});

export function makeBackup(tables: BackupTables, now: Date): BackupFile {
  // `toISOString` is right here and nowhere else in the app: this is the
  // instant the file was made, not a calendar date.
  return { app: BACKUP_APP, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

// ---------------------------------------------------------------------------
// Reporting: problems are collected, counted, and phrased for a person.

/** A problem phrased for one row and for many, so no string surgery pluralises it. */
export type Phrase = readonly [one: string, many: string];

export interface Problems {
  add: (phrase: Phrase) => void;
  line: (text: string) => void;
  empty: () => boolean;
  lines: () => string[];
}

/**
 * One corrupt row rejects the whole file, but the person restoring it deserves
 * to know how bad it is: "3 meal entries have an invalid date", not the first
 * of the three.
 */
export function problems(): Problems {
  const counted = new Map<string, { phrase: Phrase; n: number }>();
  const single: string[] = [];
  return {
    add: (phrase) => {
      const hit = counted.get(phrase[1]);
      if (hit === undefined) counted.set(phrase[1], { phrase, n: 1 });
      else hit.n += 1;
    },
    line: (text) => { single.push(text); },
    empty: () => counted.size === 0 && single.length === 0,
    lines: () => {
      const all = [
        ...[...counted.values()].map(({ phrase, n }) => `${n} ${n === 1 ? phrase[0] : phrase[1]}.`),
        ...single,
      ];
      if (all.length <= MAX_MESSAGE_LINES) return all;
      const shown = MAX_MESSAGE_LINES - 1;
      return [...all.slice(0, shown), `…and ${all.length - shown} more problems.`];
    },
  };
}

export const NOUNS: Record<TableName, Phrase> = {
  profiles: ['profile', 'profiles'],
  userIngredients: ['added ingredient', 'added ingredients'],
  settings: ['settings row', 'settings rows'],
  batches: ['purchase', 'purchases'],
  cookSessions: ['cook', 'cooks'],
  mealEntries: ['meal entry', 'meal entries'],
  dayLogs: ['day record', 'day records'],
};

const invalid = (table: TableName, label: string): Phrase =>
  [`${NOUNS[table][0]} has an invalid ${label}`, `${NOUNS[table][1]} have an invalid ${label}`];

// ---------------------------------------------------------------------------
// Predicates. Every one takes `unknown`: this is the boundary where stored
// types stop being a promise and start being a claim.

type Row = Record<string, unknown>;

const isRecord = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
const isName = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const isPositive = (v: unknown): boolean => isFiniteNumber(v) && v > 0;
const isNonNegative = (v: unknown): boolean => isFiniteNumber(v) && v >= 0;
const isOptional = (check: (v: unknown) => boolean) => (v: unknown): boolean =>
  v === undefined || check(v);
const isOneOf = (list: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && list.includes(v);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Shape AND calendar: '2026-02-30' has the shape and is not a day. */
export function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= (m === 2 && leap ? 29 : DAYS_IN_MONTH[m - 1]!);
}

const sub = (v: unknown): Row => (isRecord(v) ? v : {});

// ---------------------------------------------------------------------------
// Row specs: [what the person is told is wrong, the check].

type Spec = readonly [label: string, check: (row: Row) => boolean];

const ID: Spec = ['id', (r) => isId(r.id)];
const CREATED: Spec = ['creation time', (r) => isFiniteNumber(r.createdAt)];

const SPECS: Record<Exclude<TableName, 'mealEntries'>, readonly Spec[]> = {
  profiles: [
    ID,
    ['name', (r) => isName(r.name)],
    ['sex', (r) => isOneOf(SEXES)(r.sex)],
    ['birth year', (r) => Number.isInteger(r.birthYear)],
    ['height', (r) => isPositive(r.heightCm)],
    ['weight', (r) => isPositive(r.weightKg)],
    ['sessions per week', (r) => isNonNegative(r.sessionsPerWeek)],
    ['goal', (r) => isOneOf(GOALS)(r.goal)],
    ['protein target', (r) => isOptional(isPositive)(r.proteinGPerKg)],
  ],
  userIngredients: [
    ID,
    ['name', (r) => isName(r.name)],
    ['category', (r) => isOneOf(CATEGORIES)(r.category)],
    ['nutrients', (r) => isRecord(r.per100gRaw)
      && NUTRIENT_KEYS.every((k) => isNonNegative(sub(r.per100gRaw)[k]))],
    ['published yields', (r) => isRecord(r.publishedYield)
      && Object.entries(r.publishedYield).every(([k, f]) => isOneOf(COOK_METHODS)(k) && isPositive(f))],
    ['water absorption', (r) => typeof r.absorbsWater === 'boolean'],
    // Built-in ingredients are code, not data: a backup can only carry the user's own.
    ['source', (r) => r.source === 'user'],
    ['source reference', (r) => isOptional((v) => typeof v === 'string')(r.sourceRef)],
    ['archived flag', (r) => typeof r.archived === 'boolean'],
  ],
  settings: [
    ['id', (r) => r.id === 'singleton'],
    ['active profile', (r) => r.activeProfileId === null || isId(r.activeProfileId)],
    ['landing tab', (r) => isOneOf(LANDING_TABS)(r.landingTab)],
    ['weight unit', (r) => isOneOf(WEIGHT_UNITS)(r.defaultWeightUnit)],
  ],
  batches: [
    ID,
    ['ingredient', (r) => isId(r.ingredientId)],
    ['weight', (r) => isPositive(r.rawWeightG)],
    ['price', (r) => isNonNegative(sub(r.purchase).pricePaidMYR)],
    ['location', (r) => typeof sub(r.purchase).location === 'string'],
    ['date', (r) => isIsoDate(sub(r.purchase).date)],
    CREATED,
  ],
  cookSessions: [
    ID,
    ['purchase', (r) => isId(r.batchId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['raw weight', (r) => isPositive(r.rawUsedG)],
    ['cooked weight', (r) => isPositive(r.cookedWeightG)],
    ['date', (r) => isIsoDate(r.cookedAt)],
    ['portion count', (r) => Number.isInteger(r.portionCount) && (r.portionCount as number) >= 1],
    ['calibration flag', (r) => typeof r.excludeFromCalibration === 'boolean'],
  ],
  dayLogs: [
    ID,
    ['profile', (r) => isId(r.profileId)],
    ['date', (r) => isIsoDate(r.date)],
    ['profile-and-date id', (r) => r.id === `${String(r.profileId)}:${String(r.date)}`],
    ['calorie target', (r) => isNonNegative(sub(r.targets).kcal)],
    ['protein target', (r) => isNonNegative(sub(r.targets).proteinG)],
    ['nutrient targets', (r) => isRecord(sub(r.targets).micros)
      && Object.values(sub(sub(r.targets).micros)).every((m) => isRecord(m)
        && isOptional(isNonNegative)(m.rni) && isOptional(isNonNegative)(m.dv))],
  ],
};

const ENTRY_BASE: readonly Spec[] = [
  ID,
  ['profile', (r) => isId(r.profileId)],
  ['date', (r) => isIsoDate(r.date)],
  ['meal', (r) => isOneOf(MEAL_LABEL_KEYS)(r.label)],
  CREATED,
];

const ENTRY_KINDS: Record<MealEntry['kind'], readonly Spec[]> = {
  portion: [['cook', (r) => isId(r.cookSessionId)], ['portion count', (r) => isPositive(r.portions)]],
  weight: [['cook', (r) => isId(r.cookSessionId)], ['weight', (r) => isPositive(r.grams)]],
  ingredient: [
    ['ingredient', (r) => isId(r.ingredientId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['weight', (r) => isPositive(r.cookedG)],
  ],
  quick: [
    ['name', (r) => isName(r.name)],
    ['calorie figure', (r) => isPositive(r.kcal)],
    ['protein figure', (r) => isOptional(isNonNegative)(r.proteinG)],
  ],
};

function specsFor(table: TableName, row: Row): readonly Spec[] {
  if (table !== 'mealEntries') return SPECS[table];
  // `hasOwn`, not `in`: `'toString' in ENTRY_KINDS` is true.
  const kind = row.kind;
  if (typeof kind === 'string' && Object.hasOwn(ENTRY_KINDS, kind)) {
    return [...ENTRY_BASE, ...ENTRY_KINDS[kind as MealEntry['kind']]];
  }
  return [...ENTRY_BASE, ['kind', () => false]];
}

const fail = (error: string): Result<never> => ({ ok: false, errors: [error] });

/**
 * Steps 2–4 of the restore pipeline (spec §5.3): parse, envelope, rows.
 * Nothing here knows what is on the device. That is `planRestore`'s job, because
 * the integrity of a merge depends on it.
 */
export function parseBackup(text: string): Result<BackupTables> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(NOT_READABLE);
  }

  if (!isRecord(data) || data.app !== BACKUP_APP || !isRecord(data.tables)) return fail(NOT_OURS);
  const version = data.schemaVersion;
  if (!Number.isInteger(version) || (version as number) < 1) return fail(NOT_OURS);
  if ((version as number) > CURRENT_SCHEMA_VERSION) return fail(TOO_NEW);

  const found = problems();
  const out = emptyTables();

  for (const table of TABLE_NAMES) {
    const rows = data.tables[table];
    // Schema v1 → v3 only ever added tables, so an older file lacks some.
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      found.line(`The backup's ${NOUNS[table][1]} are not a list.`);
      continue;
    }

    const seen = new Set<unknown>();
    for (const row of rows) {
      if (!isRecord(row)) {
        found.add(invalid(table, 'format'));
        continue;
      }
      for (const [label, check] of specsFor(table, row)) {
        if (!check(row)) found.add(invalid(table, label));
      }
      if (seen.has(row.id)) {
        found.add([`${NOUNS[table][0]} has the same id as another`, `${NOUNS[table][1]} have the same id as another`]);
      }
      seen.add(row.id);
    }
    if (table === 'settings' && rows.length > 1) found.line('The backup has more than one settings row.');

    // Every row of this table has just been checked field by field; that is
    // what licenses treating the array as the table's type.
    (out as Record<TableName, unknown[]>)[table] = rows;
  }

  return found.empty() ? { ok: true, value: out } : { ok: false, errors: found.lines() };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/core/backup.test.ts src/core/purity.test.ts`
Expected: PASS. If a field case fails, the label in the test and the label in `SPECS` have
drifted. Fix whichever does not match the plan's table above. Do **not** loosen the test to
`toMatch`.

- [ ] **Step 6: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/core/types.ts src/storage/db.ts src/core/backup.ts src/core/backup.test.ts
git commit -m "feat: validate a backup file's envelope and every row"
```

---

## Task 8: Integrity, the restore plan, and the v3 fixture

**Files:**
- Create: `src/storage/__fixtures__/backup-v3.json`
- Modify: `src/core/backup.ts` (append)
- Test: `src/core/backup.test.ts` (append)

**Interfaces:**
- Consumes: `ingredientLookup`, `UNKNOWN_INGREDIENT` (Task 4); `sessionsOf`,
  `consumedFromSession`, `isSessionEntry`, `EPSILON` from `./batch`
- Produces:
  ```ts
  checkIntegrity(t: BackupTables, bundled: readonly Ingredient[], where: string): string[];
  type RestoreMode = 'replace' | 'merge';
  interface TableCounts { incoming: number; added: number; alreadyPresent: number; erased: number }
  interface RestorePlan { mode: RestoreMode; perTable: Record<TableName, TableCounts>; toWrite: BackupTables }
  planRestore(mode: RestoreMode, backup: BackupTables, device: BackupTables, bundled: readonly Ingredient[]): Result<RestorePlan>;
  planSummary(plan: RestorePlan): string;
  restoredSummary(plan: RestorePlan): string;
  ```

- [ ] **Step 1: Create the fixture**

`src/storage/__fixtures__/backup-v3.json`. It is small but covers every table, every entry
kind, an archived user ingredient and a built-in one. **Once committed, this file is never
edited.** A later schema that cannot restore it is the bug.

```json
{
  "app": "ingcalc",
  "schemaVersion": 3,
  "exportedAt": "2026-09-23T01:00:00.000Z",
  "tables": {
    "profiles": [
      { "id": "p-ali", "name": "Ali", "sex": "male", "birthYear": 1995, "heightCm": 175, "weightKg": 72, "sessionsPerWeek": 4, "goal": "maintain" }
    ],
    "userIngredients": [
      {
        "id": "u-tempeh", "name": "Tempeh (Pasar)", "category": "legume",
        "per100gRaw": { "kcal": 192, "protein": 20.3, "carbs": 7.6, "fibre": 0, "fat": 10.8, "potassium": 412, "iron": 2.7, "magnesium": 81, "zinc": 1.14, "calcium": 111, "sodium": 9 },
        "publishedYield": {}, "absorbsWater": false, "source": "user", "archived": true
      }
    ],
    "settings": [
      { "id": "singleton", "activeProfileId": "p-ali", "landingTab": "log", "defaultWeightUnit": "g" }
    ],
    "batches": [
      { "id": "b-chicken", "ingredientId": "chicken-breast", "rawWeightG": 1000, "purchase": { "pricePaidMYR": 18.5, "location": "Pasar Chow Kit", "date": "2026-09-19" }, "createdAt": 1758240000000 },
      { "id": "b-tempeh", "ingredientId": "u-tempeh", "rawWeightG": 300, "purchase": { "pricePaidMYR": 4.5, "location": "Tesco, Setapak", "date": "2026-09-20" }, "createdAt": 1758326400000 }
    ],
    "cookSessions": [
      { "id": "s-roast", "batchId": "b-chicken", "method": "roasted", "rawUsedG": 400, "cookedWeightG": 284, "cookedAt": "2026-09-19", "portionCount": 4, "excludeFromCalibration": false }
    ],
    "mealEntries": [
      { "id": "e-dinner", "profileId": "p-ali", "date": "2026-09-19", "label": "dinner", "createdAt": 1758290000000, "kind": "portion", "cookSessionId": "s-roast", "portions": 1 },
      { "id": "e-lunch", "profileId": "p-ali", "date": "2026-09-20", "label": "lunch", "createdAt": 1758340000000, "kind": "weight", "cookSessionId": "s-roast", "grams": 100 },
      { "id": "e-veg", "profileId": "p-ali", "date": "2026-09-20", "label": "lunch", "createdAt": 1758340000001, "kind": "ingredient", "ingredientId": "kangkung", "method": "boiled", "cookedG": 150 },
      { "id": "e-teh", "profileId": "p-ali", "date": "2026-09-20", "label": "snack", "createdAt": 1758350000000, "kind": "quick", "name": "Teh tarik", "kcal": 120 }
    ],
    "dayLogs": [
      { "id": "p-ali:2026-09-19", "profileId": "p-ali", "date": "2026-09-19", "targets": { "kcal": 2450, "proteinG": 130, "micros": { "potassium": { "rni": 4700, "dv": 4700 } } } }
    ]
  }
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/core/backup.test.ts`. Extend the `./backup` import with `checkIntegrity`,
`planRestore`, `planSummary`, `restoredSummary` and `type BackupTables`, and add:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENTS } from '../data/ingredients';
import { g } from './units';
```

```ts
const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');

/** A fresh, mutable copy every call. */
const fixture = (): BackupTables => {
  const r = parseBackup(FIXTURE);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

const replaceErrors = (t: BackupTables) => {
  const r = planRestore('replace', t, emptyTables(), INGREDIENTS);
  return r.ok ? [] : r.errors;
};

describe('the v3 fixture', () => {
  it('restores in both modes onto an empty device, forever', () => {
    expect(planRestore('replace', fixture(), emptyTables(), INGREDIENTS).ok).toBe(true);
    expect(planRestore('merge', fixture(), emptyTables(), INGREDIENTS).ok).toBe(true);
  });
});

describe('checkIntegrity: references', () => {
  it('finds a cook whose purchase is missing', () => {
    const t = fixture();
    t.batches = t.batches.filter((b) => b.id !== 'b-chicken');
    expect(replaceErrors(t)).toContain("1 cook refers to a purchase that isn't in the backup.");
  });

  it('finds meal entries whose cook is missing', () => {
    const t = fixture();
    t.cookSessions = [];
    expect(replaceErrors(t)).toContain("2 meal entries refer to cooks that aren't in the backup.");
  });

  it('finds entries and day records whose profile is missing', () => {
    const t = fixture();
    t.profiles = [];
    const errors = replaceErrors(t);
    expect(errors).toContain("4 meal entries refer to profiles that aren't in the backup.");
    expect(errors).toContain("1 day record refers to a profile that isn't in the backup.");
  });

  it('finds a purchase and an ingredient entry whose ingredient is missing', () => {
    const t = fixture();
    t.userIngredients = [];
    t.mealEntries = t.mealEntries.map((e) => (e.kind === 'ingredient' ? { ...e, ingredientId: 'nope' } : e));
    const errors = replaceErrors(t);
    expect(errors).toContain("1 purchase refers to an ingredient that isn't in the backup.");
    expect(errors).toContain("1 meal entry refers to an ingredient that isn't in the backup.");
  });

  it('resolves built-in ingredients without the backup carrying them', () => {
    expect(checkIntegrity(fixture(), INGREDIENTS, 'the backup')).toEqual([]);
  });
});

describe('checkIntegrity: lifecycle', () => {
  it('finds a purchase with more cooked from it than was bought', () => {
    const t = fixture();
    t.cookSessions = [{ ...t.cookSessions[0]!, rawUsedG: g(1200) }];
    expect(replaceErrors(t)).toContain(
      'The Chicken breast, skinless bought on 2026-09-19 has more cooked from it than was bought.',
    );
  });

  it('finds a cook with more eaten from it than it produced', () => {
    const t = fixture();
    // 71g + 100g already eaten from 284g; another 150g is 37g too many.
    t.mealEntries.push({ ...t.mealEntries[1]!, id: 'e-extra', kind: 'weight', cookSessionId: 's-roast', grams: g(150) } as never);
    expect(replaceErrors(t)).toContain(
      'More was eaten from the Chicken breast, skinless cooked on 2026-09-19 than the cook produced.',
    );
  });

  it('allows a cook eaten to the gram', () => {
    const t = fixture();
    t.mealEntries.push({ ...t.mealEntries[1]!, id: 'e-rest', kind: 'weight', cookSessionId: 's-roast', grams: g(113) } as never);
    expect(replaceErrors(t)).toEqual([]);
  });
});

describe('planRestore: replace', () => {
  it('writes the backup and counts what it erases', () => {
    const device = fixture();
    const r = planRestore('replace', fixture(), device, INGREDIENTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toWrite.batches.map((b) => b.id)).toEqual(['b-chicken', 'b-tempeh']);
    expect(r.value.perTable.mealEntries).toEqual({ incoming: 4, added: 4, alreadyPresent: 0, erased: 4 });
  });

  it('nulls an active profile that the backup does not contain, rather than refusing', () => {
    const t = fixture();
    t.settings = [{ ...t.settings[0]!, activeProfileId: 'gone' }];
    const r = planRestore('replace', t, emptyTables(), INGREDIENTS);
    expect(r.ok && r.value.toWrite.settings[0]!.activeProfileId).toBeNull();
  });
});

describe('planRestore: merge', () => {
  it('adds only rows the device lacks, and the device wins on a shared id', () => {
    const device = emptyTables();
    const mine = fixture();
    device.profiles = mine.profiles;
    device.batches = [{ ...mine.batches[0]!, purchase: { ...mine.batches[0]!.purchase, location: 'Changed here' } }];
    const r = planRestore('merge', fixture(), device, INGREDIENTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toWrite.batches.map((b) => b.id)).toEqual(['b-tempeh']);
    expect(r.value.toWrite.profiles).toEqual([]);
    expect(r.value.perTable.batches).toEqual({ incoming: 2, added: 1, alreadyPresent: 1, erased: 0 });
  });

  it('never writes settings', () => {
    const r = planRestore('merge', fixture(), emptyTables(), INGREDIENTS);
    expect(r.ok && r.value.toWrite.settings).toEqual([]);
  });

  it('refuses a merge whose rows are each valid but together over-eat a cook', () => {
    // The device ate 200g from the same cook; the backup's own 171g is fine
    // alone. Together, 371g from 284g.
    const device = fixture();
    device.mealEntries = [{
      id: 'e-device', profileId: 'p-ali', date: '2026-09-21', label: 'dinner', createdAt: 9,
      kind: 'weight', cookSessionId: 's-roast', grams: g(200),
    }];
    const r = planRestore('merge', fixture(), device, INGREDIENTS);
    expect(r).toEqual({
      ok: false,
      errors: ['More was eaten from the Chicken breast, skinless cooked on 2026-09-19 than the cook produced.'],
    });
  });

  it('says "or on this device" when a reference is missing from both', () => {
    const t = fixture();
    t.batches = [];
    const r = planRestore('merge', t, emptyTables(), INGREDIENTS);
    expect(r.ok ? [] : r.errors).toContain("1 cook refers to a purchase that isn't in the backup or on this device.");
  });
});

describe('planSummary and restoredSummary', () => {
  const plan = (mode: 'replace' | 'merge', device: BackupTables) => {
    const r = planRestore(mode, fixture(), device, INGREDIENTS);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.value;
  };
  const LIST = '2 purchases, 1 cook, 4 meals, 1 profile and 1 added ingredient';

  it('describes a merge onto an empty device', () => {
    expect(planSummary(plan('merge', emptyTables()))).toBe(`Adds ${LIST}.`);
    expect(restoredSummary(plan('merge', emptyTables()))).toBe(`Merged. Added ${LIST}.`);
  });

  it('describes a merge that adds nothing', () => {
    expect(planSummary(plan('merge', fixture()))).toBe(
      'Nothing in this backup is new to this device. 9 items are already on this device and will be kept as they are.',
    );
    expect(restoredSummary(plan('merge', fixture()))).toBe('Merged. Nothing was new.');
  });

  it('describes a replace over existing data by what it erases', () => {
    expect(planSummary(plan('replace', fixture()))).toBe(
      `This erases everything on this device — ${LIST} — and replaces it with the backup's ${LIST}.`,
    );
    expect(restoredSummary(plan('replace', fixture()))).toBe(`Restored ${LIST}.`);
  });

  it('describes a replace onto an empty device without talking about erasing', () => {
    expect(planSummary(plan('replace', emptyTables()))).toBe(
      `This device has nothing on it yet. The backup's ${LIST} will be restored.`,
    );
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/core/backup.test.ts`
Expected: FAIL on the new imports.

- [ ] **Step 4: Implement**

Add imports at the top of `src/core/backup.ts`:

```ts
import { consumedFromSession, EPSILON, isSessionEntry, sessionsOf } from './batch';
import { ingredientLookup, UNKNOWN_INGREDIENT } from './costs';
```

Append:

```ts
// ---------------------------------------------------------------------------
// Integrity: run over the dataset a restore WOULD produce (spec §5.3 step 5).

/**
 * Every row can be valid alone and the set still be broken: a cook whose
 * purchase is missing, or backup meals landing on the device's copy of a cook
 * and eating more than it held. The second is the one a merge creates, and
 * no row-level check can see it.
 *
 * The lifecycle checks use `core/batch.ts`'s own helpers and `EPSILON`, so
 * "over-eaten" means exactly what it means everywhere else in the app.
 */
export function checkIntegrity(t: BackupTables, bundled: readonly Ingredient[], where: string): string[] {
  const found = problems();
  const ingredientById = ingredientLookup(bundled, t.userIngredients);
  const profileIds = new Set(t.profiles.map((p) => p.id));
  const batchById = new Map(t.batches.map((b) => [b.id, b]));
  const sessionIds = new Set(t.cookSessions.map((s) => s.id));

  const missing = (one: string, many: string): Phrase =>
    [`${one} that isn't in ${where}`, `${many} that aren't in ${where}`];

  for (const s of t.cookSessions) {
    if (!batchById.has(s.batchId)) found.add(missing('cook refers to a purchase', 'cooks refer to purchases'));
  }
  for (const b of t.batches) {
    if (ingredientById(b.ingredientId) === undefined) {
      found.add(missing('purchase refers to an ingredient', 'purchases refer to ingredients'));
    }
  }
  const bySession = new Map<string, MealEntry[]>();
  for (const e of t.mealEntries) {
    if (!profileIds.has(e.profileId)) found.add(missing('meal entry refers to a profile', 'meal entries refer to profiles'));
    if (isSessionEntry(e)) {
      if (!sessionIds.has(e.cookSessionId)) found.add(missing('meal entry refers to a cook', 'meal entries refer to cooks'));
      bySession.set(e.cookSessionId, [...(bySession.get(e.cookSessionId) ?? []), e]);
    }
    if (e.kind === 'ingredient' && ingredientById(e.ingredientId) === undefined) {
      found.add(missing('meal entry refers to an ingredient', 'meal entries refer to ingredients'));
    }
  }
  for (const d of t.dayLogs) {
    if (!profileIds.has(d.profileId)) found.add(missing('day record refers to a profile', 'day records refer to profiles'));
  }

  const nameOf = (b: Batch | undefined): string =>
    (b === undefined ? undefined : ingredientById(b.ingredientId)?.name) ?? UNKNOWN_INGREDIENT;

  for (const b of t.batches) {
    const used = sessionsOf(b.id, t.cookSessions).reduce((sum, s) => sum + s.rawUsedG, 0);
    if (used > b.rawWeightG + EPSILON) {
      found.line(`The ${nameOf(b)} bought on ${b.purchase.date} has more cooked from it than was bought.`);
    }
  }
  for (const s of t.cookSessions) {
    if (consumedFromSession(s, bySession.get(s.id) ?? []) > s.cookedWeightG + EPSILON) {
      found.line(`More was eaten from the ${nameOf(batchById.get(s.batchId))} cooked on ${s.cookedAt} than the cook produced.`);
    }
  }

  return found.lines();
}

// ---------------------------------------------------------------------------
// Planning.

export type RestoreMode = 'replace' | 'merge';

export interface TableCounts {
  incoming: number;
  added: number;
  alreadyPresent: number;
  erased: number;
}

export interface RestorePlan {
  mode: RestoreMode;
  perTable: Record<TableName, TableCounts>;
  /** Exactly the rows to write; for replace, after clearing every table. */
  toWrite: BackupTables;
}

/**
 * A dangling active profile is harmless (`useProfiles` falls back to the
 * first profile), so it is repaired rather than failing the whole restore.
 */
function withResolvableActiveProfile(t: BackupTables): BackupTables {
  const ids = new Set(t.profiles.map((p) => p.id));
  return {
    ...t,
    settings: t.settings.map((s) =>
      (s.activeProfileId !== null && !ids.has(s.activeProfileId) ? { ...s, activeProfileId: null } : s)),
  };
}

const onlyNew = <T extends { id: string }>(device: readonly T[], incoming: readonly T[]): T[] => {
  const have = new Set(device.map((r) => r.id));
  return incoming.filter((r) => !have.has(r.id));
};

/**
 * Merge is add-only: a row whose id the device already has is skipped, so a
 * merge can never modify or delete anything. Rows carry no `updatedAt`, so
 * "the newer one" is unknowable; replace is the tool for rolling back. The
 * device's settings, and its frozen day-log targets, are always kept.
 */
export function planRestore(
  mode: RestoreMode,
  backup: BackupTables,
  device: BackupTables,
  bundled: readonly Ingredient[],
): Result<RestorePlan> {
  let toWrite: BackupTables;
  let resulting: BackupTables;

  if (mode === 'replace') {
    toWrite = withResolvableActiveProfile(backup);
    resulting = toWrite;
  } else {
    toWrite = {
      profiles: onlyNew(device.profiles, backup.profiles),
      userIngredients: onlyNew(device.userIngredients, backup.userIngredients),
      settings: [],
      batches: onlyNew(device.batches, backup.batches),
      cookSessions: onlyNew(device.cookSessions, backup.cookSessions),
      mealEntries: onlyNew(device.mealEntries, backup.mealEntries),
      dayLogs: onlyNew(device.dayLogs, backup.dayLogs),
    };
    resulting = {
      profiles: [...device.profiles, ...toWrite.profiles],
      userIngredients: [...device.userIngredients, ...toWrite.userIngredients],
      settings: device.settings,
      batches: [...device.batches, ...toWrite.batches],
      cookSessions: [...device.cookSessions, ...toWrite.cookSessions],
      mealEntries: [...device.mealEntries, ...toWrite.mealEntries],
      dayLogs: [...device.dayLogs, ...toWrite.dayLogs],
    };
  }

  const errors = checkIntegrity(
    resulting, bundled, mode === 'replace' ? 'the backup' : 'the backup or on this device',
  );
  if (errors.length > 0) return { ok: false, errors };

  const perTable = Object.fromEntries(TABLE_NAMES.map((t) => [t, {
    incoming: backup[t].length,
    added: toWrite[t].length,
    alreadyPresent: mode === 'merge' ? backup[t].length - toWrite[t].length : 0,
    erased: mode === 'replace' ? device[t].length : 0,
  }])) as Record<TableName, TableCounts>;

  return { ok: true, value: { mode, perTable, toWrite } };
}

// ---------------------------------------------------------------------------
// Copy for the preview and the result. Only the tables a person recognises are
// listed; day records and settings are counted but not named.

const SHOWN: readonly (readonly [TableName, string, string])[] = [
  ['batches', 'purchase', 'purchases'],
  ['cookSessions', 'cook', 'cooks'],
  ['mealEntries', 'meal', 'meals'],
  ['profiles', 'profile', 'profiles'],
  ['userIngredients', 'added ingredient', 'added ingredients'],
];

/** "2 purchases, 1 cook and 4 meals", or null when every count is zero. */
function listCounts(plan: RestorePlan, pick: (c: TableCounts) => number): string | null {
  const parts = SHOWN.flatMap(([t, one, many]) => {
    const n = pick(plan.perTable[t]);
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

export function planSummary(plan: RestorePlan): string {
  if (plan.mode === 'merge') {
    const added = listCounts(plan, (c) => c.added);
    const kept = SHOWN.reduce((sum, [t]) => sum + plan.perTable[t].alreadyPresent, 0);
    const head = added === null ? 'Nothing in this backup is new to this device.' : `Adds ${added}.`;
    if (kept === 0) return head;
    return `${head} ${kept} ${kept === 1 ? 'item is' : 'items are'} already on this device and will be kept as they are.`;
  }
  const incoming = listCounts(plan, (c) => c.incoming) ?? 'nothing';
  const erased = listCounts(plan, (c) => c.erased);
  return erased === null
    ? `This device has nothing on it yet. The backup's ${incoming} will be restored.`
    : `This erases everything on this device — ${erased} — and replaces it with the backup's ${incoming}.`;
}

export function restoredSummary(plan: RestorePlan): string {
  if (plan.mode === 'merge') {
    const added = listCounts(plan, (c) => c.added);
    return added === null ? 'Merged. Nothing was new.' : `Merged. Added ${added}.`;
  }
  const incoming = listCounts(plan, (c) => c.incoming);
  return incoming === null ? 'Restored. The backup was empty.' : `Restored ${incoming}.`;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/core/backup.test.ts src/core/purity.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/storage/__fixtures__/backup-v3.json src/core/backup.ts src/core/backup.test.ts
git commit -m "feat: check a restore's integrity and plan replace and merge"
```

---

## Task 9: `storage/backup.ts`

**Files:**
- Create: `src/storage/backup.ts`
- Test: `src/storage/backup.test.ts`

**Interfaces:**
- Consumes: `makeBackup`, `planRestore`, `BackupTables`, `BackupFile`, `RestoreMode`,
  `RestorePlan`, `Result` (Tasks 7–8); `INGREDIENTS`
- Produces:
  ```ts
  readAllTables(): Promise<BackupTables>;
  exportAll(now?: Date): Promise<BackupFile>;
  previewRestore(mode: RestoreMode, backup: BackupTables): Promise<Result<RestorePlan>>;
  applyRestore(mode: RestoreMode, backup: BackupTables): Promise<Result<RestorePlan>>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_SCHEMA_VERSION, parseBackup, type BackupTables } from '../core/backup';
import { g } from '../core/units';
import { applyRestore, exportAll, previewRestore, readAllTables } from './backup';
import { db } from './db';

const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
const fixture = (): BackupTables => {
  const r = parseBackup(FIXTURE);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

/** toArray() returns key order; compare tables regardless of it. */
const byId = <T extends { id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const normalise = (t: BackupTables) =>
  Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, byId(rows as { id: string }[])]));

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup storage', () => {
  it('stamps the schema version the database actually runs', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(db.verno);
  });

  it('round-trips: restore, export, and the tables are what went in', async () => {
    const r = await applyRestore('replace', fixture());
    expect(r.ok).toBe(true);
    const file = await exportAll(new Date('2026-09-23T00:00:00.000Z'));
    expect(file.app).toBe('ingcalc');
    expect(normalise(file.tables)).toEqual(normalise(fixture()));
  });

  it('replace erases what was on the device', async () => {
    await db.batches.put({ ...fixture().batches[0]!, id: 'b-local' });
    await applyRestore('replace', fixture());
    expect((await db.batches.toArray()).map((b) => b.id).sort()).toEqual(['b-chicken', 'b-tempeh']);
  });

  it('merge adds only missing rows and leaves a device row with the same id untouched', async () => {
    const local = fixture().batches[0]!;
    await db.batches.put({ ...local, purchase: { ...local.purchase, location: 'Changed here' } });
    await db.settings.put({ id: 'singleton', activeProfileId: null, landingTab: 'kitchen', defaultWeightUnit: 'kg' });
    const r = await applyRestore('merge', fixture());
    expect(r.ok).toBe(true);
    expect((await db.batches.get('b-chicken'))!.purchase.location).toBe('Changed here');
    expect(await db.batches.get('b-tempeh')).toBeDefined();
    expect((await db.settings.get('singleton'))!.landingTab).toBe('kitchen');
  });

  it.each(['replace', 'merge'] as const)('%s leaves every table as it was when a write fails', async (mode) => {
    await applyRestore('replace', fixture());
    await db.batches.put({ ...fixture().batches[0]!, id: 'b-local' });
    const before = await readAllTables();

    vi.spyOn(db.dayLogs, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    const incoming = fixture();
    incoming.dayLogs = [{ ...incoming.dayLogs[0]!, id: 'p-ali:2026-09-22', date: '2026-09-22' }];
    await expect(applyRestore(mode, incoming)).rejects.toThrow('disk full');

    expect(normalise(await readAllTables())).toEqual(normalise(before));
  });

  it('re-checks inside the write, so a change made after the preview is not merged over', async () => {
    const preview = await previewRestore('merge', fixture());
    expect(preview.ok).toBe(true);

    // Between preview and confirm, another tab logs 200g against the same cook.
    await db.cookSessions.put(fixture().cookSessions[0]!);
    await db.batches.put(fixture().batches[0]!);
    await db.profiles.put(fixture().profiles[0]!);
    await db.mealEntries.put({
      id: 'e-other-tab', profileId: 'p-ali', date: '2026-09-21', label: 'dinner', createdAt: 9,
      kind: 'weight', cookSessionId: 's-roast', grams: g(200),
    });

    const r = await applyRestore('merge', fixture());
    expect(r.ok).toBe(false);
    expect(await db.mealEntries.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/storage/backup.test.ts`
Expected: FAIL. `./backup` does not exist.

- [ ] **Step 3: Implement**

```ts
import {
  makeBackup, planRestore,
  type BackupFile, type BackupTables, type RestoreMode, type RestorePlan, type Result,
} from '../core/backup';
import { INGREDIENTS } from '../data/ingredients';
import { db } from './db';

const allTables = () => [
  db.profiles, db.userIngredients, db.settings, db.batches, db.cookSessions, db.mealEntries, db.dayLogs,
];

async function readTables(): Promise<BackupTables> {
  const [profiles, userIngredients, settings, batches, cookSessions, mealEntries, dayLogs] =
    await Promise.all([
      db.profiles.toArray(), db.userIngredients.toArray(), db.settings.toArray(),
      db.batches.toArray(), db.cookSessions.toArray(), db.mealEntries.toArray(),
      db.dayLogs.toArray(),
    ]);
  return { profiles, userIngredients, settings, batches, cookSessions, mealEntries, dayLogs };
}

/** One read transaction, so the seven tables are a single consistent snapshot. */
export const readAllTables = (): Promise<BackupTables> =>
  db.transaction('r', allTables(), readTables);

export const exportAll = async (now: Date = new Date()): Promise<BackupFile> =>
  makeBackup(await readAllTables(), now);

/** What the confirm step shows. Advisory: `applyRestore` plans again. */
export const previewRestore = async (
  mode: RestoreMode,
  backup: BackupTables,
): Promise<Result<RestorePlan>> => planRestore(mode, backup, await readAllTables(), INGREDIENTS);

/**
 * The only write. It plans again from inside the transaction, against what is
 * on the device NOW, because another tab may have written since the preview,
 * and a stale plan must not be applied.
 *
 * A failed plan returns without writing. A failed write throws out of the
 * callback, and Dexie aborts the transaction, so every table stays as it was,
 * including the ones `replace` had already cleared.
 */
export const applyRestore = (
  mode: RestoreMode,
  backup: BackupTables,
): Promise<Result<RestorePlan>> =>
  db.transaction('rw', allTables(), async () => {
    const plan = planRestore(mode, backup, await readTables(), INGREDIENTS);
    if (!plan.ok) return plan;

    if (mode === 'replace') await Promise.all(allTables().map((t) => t.clear()));

    const w = plan.value.toWrite;
    await db.profiles.bulkAdd(w.profiles);
    await db.userIngredients.bulkAdd(w.userIngredients);
    await db.settings.bulkAdd(w.settings);
    await db.batches.bulkAdd(w.batches);
    await db.cookSessions.bulkAdd(w.cookSessions);
    await db.mealEntries.bulkAdd(w.mealEntries);
    await db.dayLogs.bulkAdd(w.dayLogs);
    return plan;
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/storage/backup.test.ts`
Expected: PASS. If the failure-injection test leaves rows behind, the spy is not being hit
inside the transaction. Check that `applyRestore` calls `db.dayLogs.bulkAdd` (the spied
instance), not a table handle obtained another way. Do not weaken the assertion.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/storage/backup.ts src/storage/backup.test.ts
git commit -m "feat: export and restore the whole database in single transactions"
```

---
## Task 10: `downloadText`, `RangePicker`, `TotalsList`

Three small leaves, batched into one dispatch with one review. They share no code, but each
is too small to be worth a review of its own.

**Files:**
- Create: `src/ui/download.ts`, `src/ui/components/RangePicker.tsx`, `src/ui/components/TotalsList.tsx`
- Test: `src/ui/download.test.ts`, `src/ui/components/RangePicker.test.tsx`, `src/ui/components/TotalsList.test.tsx`

**Interfaces:**
- Consumes: `COST_RANGES`, `CostRange`, `TotalRow` (Tasks 4–5)
- Produces:
  ```ts
  downloadText(filename: string, mime: string, text: string): void;
  const RANGE_LABELS: Record<CostRange, string>;
  RangePicker(props: { value: CostRange; onChange: (r: CostRange) => void });
  TotalsList(props: { title: string; keyHeading: string; rows: readonly TotalRow[]; showShare?: boolean; testId?: string });
  ```

- [ ] **Step 1: Write the failing tests**

`src/ui/download.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadText } from './download';

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
  vi.restoreAllMocks();
});

describe('downloadText', () => {
  it('clicks a temporary link to the text, then releases the URL', async () => {
    const create = vi.fn((_: Blob) => 'blob:x');
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    downloadText('a.csv', 'text/csv;charset=utf-8', 'hello');

    const blob = create.mock.calls[0]![0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(clicked!.download).toBe('a.csv');
    expect(clicked!.getAttribute('href')).toBe('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
```

`src/ui/components/RangePicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RangePicker } from './RangePicker';

describe('RangePicker', () => {
  it('marks the current range and reports a new one', async () => {
    const onChange = vi.fn();
    render(<RangePicker value="thisMonth" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 3 months' }));
    expect(onChange).toHaveBeenCalledWith('last3Months');
  });

  it('is a labelled group', () => {
    render(<RangePicker value="all" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument();
  });
});
```

`src/ui/components/TotalsList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TotalsList } from './TotalsList';
import { myr } from '../../core/units';

const rows = [
  { key: 'pasar', label: 'Pasar', count: 3, spentMYR: myr(30), share: 0.6666 },
  { key: 'tesco', label: 'Tesco', count: 1, spentMYR: myr(15), share: 0.3334 },
];

describe('TotalsList', () => {
  it('lists each group with its count, spend and share', () => {
    render(<TotalsList title="By location" keyHeading="Location" rows={rows} showShare />);
    expect(screen.getByRole('heading', { name: 'By location' })).toBeInTheDocument();
    const pasar = screen.getByRole('row', { name: /Pasar/ });
    expect(within(pasar).getAllByRole('cell').map((c) => c.textContent)).toEqual(['3', 'RM30.00', '67%']);
  });

  it('leaves the share column out unless asked', () => {
    render(<TotalsList title="By month" keyHeading="Month" rows={rows} />);
    expect(screen.queryByRole('columnheader', { name: 'Share' })).toBeNull();
    expect(within(screen.getByRole('row', { name: /Tesco/ })).getAllByRole('cell')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/download.test.ts src/ui/components/RangePicker.test.tsx src/ui/components/TotalsList.test.tsx`
Expected: FAIL. The modules do not exist.

- [ ] **Step 3: Implement**

`src/ui/download.ts`:

```ts
/**
 * Hands the browser a file to save. The link is removed at once and the
 * object URL released on the next tick, after the click has been dispatched,
 * so repeated exports do not accumulate blobs.
 */
export function downloadText(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

`src/ui/components/RangePicker.tsx`:

```tsx
import { COST_RANGES, type CostRange } from '../../core/costs';

export const RANGE_LABELS: Record<CostRange, string> = {
  thisMonth: 'This month',
  last3Months: 'Last 3 months',
  thisYear: 'This year',
  all: 'All time',
};

/** The weight input's segmented control, as a 2×2 grid on a phone. */
export function RangePicker({ value, onChange }: { value: CostRange; onChange: (r: CostRange) => void }) {
  return (
    <div className="seg range-picker" role="group" aria-label="Period">
      {COST_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          className="seg__btn"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/components/TotalsList.tsx`:

```tsx
import type { TotalRow } from '../../core/costs';
import { formatMYR } from '../../core/units';

interface Props {
  title: string;
  /** What the first column groups by: "Location", "Month". */
  keyHeading: string;
  rows: readonly TotalRow[];
  showShare?: boolean;
  testId?: string;
}

export function TotalsList({ title, keyHeading, rows, showShare = false, testId }: Props) {
  return (
    <div className="card" data-testid={testId}>
      <h3 className="card__title">{title}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{keyHeading}</th>
              <th scope="col">Purchases</th>
              <th scope="col">Spent</th>
              {showShare && <th scope="col">Share</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.count}</td>
                <td>{formatMYR(r.spentMYR)}</td>
                {showShare && <td>{Math.round(r.share * 100)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: the Step 2 command.
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/ui/download.ts src/ui/download.test.ts src/ui/components/RangePicker.tsx src/ui/components/RangePicker.test.tsx src/ui/components/TotalsList.tsx src/ui/components/TotalsList.test.tsx
git commit -m "feat: add the download helper, range picker and totals list"
```

---

## Task 11: `PurchaseTable`

**Files:**
- Create: `src/ui/components/PurchaseTable.tsx`
- Test: `src/ui/components/PurchaseTable.test.tsx`

**Interfaces:**
- Consumes: `PurchaseRow`, `Sort`, `SortKey`, `nextSort`, `sortRows` (Tasks 4–5)
- Produces: `PurchaseTable(props: { rows: readonly PurchaseRow[]; sort: Sort; onSort: (key: SortKey) => void })`.
  The component is controlled: the screen owns `sort` and the sorting.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseTable } from './PurchaseTable';
import { DEFAULT_SORT, nextSort, sortRows, type PurchaseRow, type Sort } from '../../core/costs';
import { g, myr } from '../../core/units';
import { formatIsoDate } from '../dates';

const row = (id: string, over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  batchId: id, date: '2026-09-19', ingredient: `Item ${id}`, location: 'Pasar',
  rawWeightG: g(1000), priceMYR: myr(20), myrPerKgRaw: myr(20), proteinRawG: 225,
  proteinPerMYRRaw: 11.25, cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null,
  ...over,
});

const bodyRows = () => within(screen.getByTestId('purchase-table')).getAllByRole('row').slice(1);

function Harness({ rows }: { rows: PurchaseRow[] }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  return <PurchaseTable rows={sortRows(rows, sort)} sort={sort} onSort={(k) => setSort(nextSort(sort, k))} />;
}

describe('PurchaseTable', () => {
  it('shows every column, with the ingredient as the row header', () => {
    render(<PurchaseTable rows={[row('a', { location: '' })]} sort={DEFAULT_SORT} onSort={() => {}} />);
    const [r] = bodyRows();
    expect(within(r!).getByRole('rowheader')).toHaveTextContent('Item a');
    expect(within(r!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      formatIsoDate('2026-09-19'), '—', '1,000g', 'RM20.00', 'RM20.00', '11.3', '—',
    ]);
  });

  it('marks only the active column with aria-sort', () => {
    render(<PurchaseTable rows={[row('a')]} sort={{ key: 'priceMYR', dir: 'asc' }} onSort={() => {}} />);
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Date/ })).not.toHaveAttribute('aria-sort');
  });

  it('reports the column tapped', async () => {
    const onSort = vi.fn();
    render(<PurchaseTable rows={[row('a')]} sort={DEFAULT_SORT} onSort={onSort} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /g protein\/RM cooked/ }));
    expect(onSort).toHaveBeenCalledWith('proteinPerMYRCooked');
  });

  it('sorts on a tap and reverses on a second tap', async () => {
    const user = userEvent.setup();
    render(<Harness rows={[row('cheap', { priceMYR: myr(2) }), row('dear', { priceMYR: myr(40) })]} />);
    await user.click(screen.getByRole('button', { name: /Price/ }));
    expect(within(bodyRows()[0]!).getByRole('rowheader')).toHaveTextContent('Item dear');
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: /Price/ }));
    expect(within(bodyRows()[0]!).getByRole('rowheader')).toHaveTextContent('Item cheap');
  });
});
```

The weight cell asserts `'1,000g'` because `formatG` uses `en-MY` grouping. If the test
environment's ICU renders it differently, assert `formatG(g(1000))` instead of the literal.
Do not change `formatG`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/components/PurchaseTable.test.tsx`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement**

```tsx
import type { PurchaseRow, Sort, SortKey } from '../../core/costs';
import { formatG, formatMYR } from '../../core/units';
import { formatIsoDate } from '../dates';

const DASH = '—';
const ratio = (v: number | null): string => (v === null ? DASH : v.toFixed(1));

interface Column {
  key: SortKey;
  label: string;
  cell: (r: PurchaseRow) => string;
}

/** Order is the spec's (§3.4). The first column is pinned by CSS. */
const COLUMNS: readonly Column[] = [
  { key: 'ingredient', label: 'Ingredient', cell: (r) => r.ingredient },
  { key: 'date', label: 'Date', cell: (r) => formatIsoDate(r.date) },
  { key: 'location', label: 'Location', cell: (r) => (r.location.trim() === '' ? DASH : r.location) },
  { key: 'rawWeightG', label: 'Weight', cell: (r) => formatG(r.rawWeightG) },
  { key: 'priceMYR', label: 'Price', cell: (r) => formatMYR(r.priceMYR) },
  { key: 'myrPerKgRaw', label: 'RM/kg', cell: (r) => (r.myrPerKgRaw === null ? DASH : formatMYR(r.myrPerKgRaw)) },
  { key: 'proteinPerMYRRaw', label: 'g protein/RM raw', cell: (r) => ratio(r.proteinPerMYRRaw) },
  { key: 'proteinPerMYRCooked', label: 'g protein/RM cooked', cell: (r) => ratio(r.proteinPerMYRCooked) },
];

const [FIRST, ...REST] = COLUMNS as [Column, ...Column[]];

interface Props {
  rows: readonly PurchaseRow[];
  sort: Sort;
  onSort: (key: SortKey) => void;
}

/**
 * A real table in its own sideways-scrolling box. The page never scrolls
 * sideways; this box does, under a pinned ingredient column.
 */
export function PurchaseTable({ rows, sort, onSort }: Props) {
  return (
    <div className="table-scroll">
      <table className="purchase-table" data-testid="purchase-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-btn" onClick={() => onSort(c.key)}>
                    {c.label}
                    <span className="sort-btn__arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.batchId}>
              <th scope="row">{FIRST.cell(r)}</th>
              {REST.map((c) => <td key={c.key}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/components/PurchaseTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/ui/components/PurchaseTable.tsx src/ui/components/PurchaseTable.test.tsx
git commit -m "feat: add the sortable purchase table"
```

---

## Task 12: `DataPanel`

**Files:**
- Create: `src/ui/components/DataPanel.tsx`
- Test: `src/ui/components/DataPanel.test.tsx`

**Interfaces:**
- Consumes: `parseBackup`, `planSummary`, `restoredSummary`, `MAX_BACKUP_BYTES`,
  `NOT_READABLE`, `TOO_LARGE`, `BackupTables`, `RestoreMode`, `RestorePlan` (Tasks 7–8);
  `exportAll`, `previewRestore`, `applyRestore` (Task 9); `downloadText` (Task 10)
- Produces:
  ```ts
  DataPanel(props: {
    onExportPurchases: (() => void) | null;   // null disables the button
    onExportMeals: (() => void) | null;
    onRestored: () => void;                    // called only after a successful write
    today?: Date;
  })
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataPanel } from './DataPanel';
import { MAX_BACKUP_BYTES, NOT_READABLE, TOO_LARGE } from '../../core/backup';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';

vi.mock('../download', () => ({ downloadText: vi.fn() }));
import { downloadText } from '../download';

const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
const LIST = '2 purchases, 1 cook, 4 meals, 1 profile and 1 added ingredient';
const TODAY = new Date(2026, 8, 23);

const setup = (over: Partial<Parameters<typeof DataPanel>[0]> = {}) => {
  const onRestored = vi.fn();
  render(<DataPanel onExportPurchases={null} onExportMeals={null} onRestored={onRestored} today={TODAY} {...over} />);
  return { onRestored, user: userEvent.setup() };
};

const fileOf = (text: string) => new File([text], 'backup.json', { type: 'application/json' });
const restoreInput = () => screen.getByLabelText(/restore from backup/i);

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(downloadText).mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('DataPanel: exports and backup', () => {
  it('disables an export with nothing in it, and runs one that has', async () => {
    const onExportMeals = vi.fn();
    const { user } = setup({ onExportMeals });
    expect(screen.getByRole('button', { name: 'Export purchases (CSV)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Export meals (CSV)' }));
    expect(onExportMeals).toHaveBeenCalledOnce();
  });

  it('downloads the whole database as a backup named for today', async () => {
    await db.profiles.put({ id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Download backup (JSON)' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledOnce());
    const [name, mime, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-backup-2026-09-23.json');
    expect(mime).toBe('application/json');
    expect(JSON.parse(text).tables.profiles[0].name).toBe('Ali');
  });
});

describe('DataPanel: restore', () => {
  it('rejects a file that is not JSON', async () => {
    const { user } = setup();
    await user.upload(restoreInput(), fileOf('{nope'));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_READABLE);
  });

  it('rejects a file too large to be a backup before reading it', async () => {
    const { user } = setup();
    const big = fileOf('{}');
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    await user.upload(restoreInput(), big);
    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_LARGE);
  });

  it('merges onto an empty device and reports what it added', async () => {
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Merge' }));
    expect(await screen.findByTestId('restore-preview')).toHaveTextContent(`Adds ${LIST}.`);
    await user.click(screen.getByRole('button', { name: 'Merge into this device' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(screen.getByTestId('restore-done')).toHaveTextContent(`Merged. Added ${LIST}.`);
    expect(await db.batches.count()).toBe(2);
    expect(restoreInput()).toBeInTheDocument();
  });

  it('spells out what a replace erases, offers a backup first, then replaces', async () => {
    await db.batches.put({
      id: 'b-local', ingredientId: 'chicken-breast', rawWeightG: g(500),
      purchase: { pricePaidMYR: myr(9), location: 'Here', date: '2026-09-22' }, createdAt: 1,
    });
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByTestId('restore-preview'))
      .toHaveTextContent(`This erases everything on this device — 1 purchase — and replaces it with the backup's ${LIST}.`);

    await user.click(screen.getByRole('button', { name: 'Download a backup of this device first' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'Erase and restore' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect((await db.batches.toArray()).map((b) => b.id).sort()).toEqual(['b-chicken', 'b-tempeh']);
  });

  it('cancels back to the start without writing', async () => {
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(restoreInput()).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
    expect(await db.batches.count()).toBe(0);
  });

  it('reports an integrity failure when a mode is chosen, and writes nothing', async () => {
    const broken = JSON.parse(FIXTURE);
    broken.tables.batches = [];
    const { user } = setup();
    await user.upload(restoreInput(), fileOf(JSON.stringify(broken)));
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("1 cook refers to a purchase that isn't in the backup.");
    expect(restoreInput()).toBeInTheDocument();
  });

  it('says nothing changed when the write fails, and does not report success', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.dayLogs, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Merge' }));
    await user.click(await screen.findByRole('button', { name: 'Merge into this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The restore failed and nothing was changed.');
    expect(onRestored).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Restoring a backup failed', expect.any(Error));
    expect(await db.batches.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/components/DataPanel.test.tsx`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import {
  MAX_BACKUP_BYTES, NOT_READABLE, parseBackup, planSummary, restoredSummary, TOO_LARGE,
  type BackupTables, type RestoreMode, type RestorePlan,
} from '../../core/backup';
import { applyRestore, exportAll, previewRestore } from '../../storage/backup';
import { todayIso } from '../dates';
import { downloadText } from '../download';

type Stage =
  | { kind: 'idle' }
  | { kind: 'chooseMode'; tables: BackupTables }
  | { kind: 'preview'; tables: BackupTables; plan: RestorePlan };

interface Props {
  /** Null when the export would have no rows; the button is then disabled. */
  onExportPurchases: (() => void) | null;
  onExportMeals: (() => void) | null;
  /** Called only after a restore has actually been written. */
  onRestored: () => void;
  today?: Date;
}

/** `Blob.text()` where the browser has it, FileReader where it does not. */
const readText = (file: Blob): Promise<string> =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

/**
 * The restore pipeline of spec §5.3, as a small state machine: pick a file,
 * choose merge or replace, read the preview, confirm. Every failure lands back
 * at the start with the reason, and nothing is written before the confirm.
 */
export function DataPanel({ onExportPurchases, onExportMeals, onRestored, today = new Date() }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (nextErrors: string[] = []) => {
    setStage({ kind: 'idle' });
    setErrors(nextErrors);
    setBusy(false);
  };

  const downloadBackup = async () => {
    try {
      const file = await exportAll();
      downloadText(`ingcalc-backup-${todayIso(today)}.json`, 'application/json', JSON.stringify(file, null, 2));
    } catch (err) {
      console.error('Creating a backup failed', err);
      setErrors(['The backup could not be created.']);
    }
  };

  const pickFile = async (file: File | undefined) => {
    setDone(null);
    setErrors([]);
    if (file === undefined) return;
    if (file.size > MAX_BACKUP_BYTES) {
      reset([TOO_LARGE]);
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch (err) {
      console.error('Reading a backup file failed', err);
      reset([NOT_READABLE]);
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      reset(parsed.errors);
      return;
    }
    setStage({ kind: 'chooseMode', tables: parsed.value });
  };

  const choose = async (mode: RestoreMode, tables: BackupTables) => {
    try {
      const plan = await previewRestore(mode, tables);
      if (!plan.ok) {
        reset(plan.errors);
        return;
      }
      setStage({ kind: 'preview', tables, plan: plan.value });
    } catch (err) {
      console.error('Reading this device before a restore failed', err);
      reset(["This device's data could not be read, so nothing was changed."]);
    }
  };

  const confirm = async (mode: RestoreMode, tables: BackupTables) => {
    setBusy(true);
    setErrors([]);
    let result: Awaited<ReturnType<typeof applyRestore>>;
    try {
      result = await applyRestore(mode, tables);
    } catch (err) {
      console.error('Restoring a backup failed', err);
      reset(['The restore failed and nothing was changed.']);
      return;
    }
    if (!result.ok) {
      // The device changed between the preview and the confirm.
      reset(result.errors);
      return;
    }
    reset();
    setDone(restoredSummary(result.value));
    onRestored();
  };

  return (
    <div className="card data-panel">
      <h3 className="card__title">Your data</h3>

      <div className="data-panel__actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={onExportPurchases === null}
          onClick={() => onExportPurchases?.()}
        >
          Export purchases (CSV)
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={onExportMeals === null}
          onClick={() => onExportMeals?.()}
        >
          Export meals (CSV)
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => { setDone(null); setErrors([]); void downloadBackup(); }}
        >
          Download backup (JSON)
        </button>
        <p className="data-panel__note">
          Everything on this device, in one file. Keep it somewhere other than this phone.
        </p>

        {stage.kind === 'idle' && (
          <label className="btn btn--secondary data-panel__restore">
            Restore from backup…
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(e) => { void pickFile(e.target.files?.[0]); }}
            />
          </label>
        )}
      </div>

      {stage.kind === 'chooseMode' && (
        <div className="data-panel__step">
          <p>
            Merge keeps everything on this device and adds what is new. Replace erases this
            device and restores the backup exactly.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void choose('merge', stage.tables); }}>
              Merge
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => { void choose('replace', stage.tables); }}>
              Replace
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'preview' && (
        <div className="data-panel__step">
          <p data-testid="restore-preview">{planSummary(stage.plan)}</p>
          <div className="btn-row">
            {stage.plan.mode === 'merge' ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => { void confirm('merge', stage.tables); }}
              >
                Merge into this device
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => { void confirm('replace', stage.tables); }}
                >
                  Erase and restore
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => { void downloadBackup(); }}
                >
                  Download a backup of this device first
                </button>
              </>
            )}
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {done !== null && <p className="banner banner--info" data-testid="restore-done">{done}</p>}

      {errors.length > 0 && (
        <div role="alert">
          {errors.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/components/DataPanel.test.tsx`
Expected: PASS. If `user.upload` delivers no file, check that the `accept` attribute
matches: user-event filters by `accept` and the fixture file is named `backup.json` with
type `application/json`.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/ui/components/DataPanel.tsx src/ui/components/DataPanel.test.tsx
git commit -m "feat: add backup, restore and export controls"
```

---

## Task 13: `CostsScreen`

**Files:**
- Create: `src/ui/screens/CostsScreen.tsx`
- Test: `src/ui/screens/CostsScreen.test.tsx`

**Interfaces:**
- Consumes: everything in Tasks 4–12; `useKitchen`; `listUserIngredients`; `entryItemName`;
  `INGREDIENTS`, `RETENTION`, `CATEGORY_YIELD`
- Produces: `CostsScreen(props: { profiles: readonly Profile[]; onDataReplaced: () => void; today?: Date })`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostsScreen } from './CostsScreen';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';
import type { Batch } from '../../core/types';

vi.mock('../download', () => ({ downloadText: vi.fn() }));
import { downloadText } from '../download';

const TODAY = new Date(2026, 8, 23);

const batch = (id: string, date: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date }, createdAt: Number(id.replace(/\D/g, '')) || 0,
  ...over,
});

const renderScreen = () => render(<CostsScreen profiles={[]} onDataReplaced={() => {}} today={TODAY} />);
const bodyRows = async () =>
  within(await screen.findByTestId('purchase-table')).getAllByRole('row').slice(1);

beforeEach(async () => {
  vi.mocked(downloadText).mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('CostsScreen', () => {
  it('points an empty device at Kitchen, and still offers restore', async () => {
    renderScreen();
    expect(await screen.findByTestId('costs-empty')).toHaveTextContent(
      'Nothing bought yet — purchases you log in Kitchen appear here.',
    );
    expect(screen.getByLabelText(/restore from backup/i)).toBeInTheDocument();
  });

  it('says so when nothing was bought in the chosen period', async () => {
    await db.batches.put(batch('b1', '2026-07-10'));
    renderScreen();
    expect(await screen.findByTestId('costs-none-in-range')).toHaveTextContent('Nothing bought in this period.');
  });

  it('scopes the table to the range and widens it on request', async () => {
    await db.batches.bulkPut([batch('b1', '2026-09-10'), batch('b2', '2026-07-10')]);
    renderScreen();
    expect(await bodyRows()).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 3 months' }));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
  });

  it('summarises the range with a weighted protein figure', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    // 1000g × 22.5% = 225g protein for RM20.
    expect(await screen.findByTestId('costs-summary')).toHaveTextContent('RM20.00 · 1 purchase · 11.3 g protein per RM');
  });

  it('names a purchase of an archived ingredient', async () => {
    await db.userIngredients.put({
      id: 'u-tempeh', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
      publishedYield: {}, absorbsWater: false, source: 'user', archived: true,
    });
    await db.batches.put(batch('b1', '2026-09-10', { ingredientId: 'u-tempeh' }));
    renderScreen();
    await waitFor(async () => {
      expect(within((await bodyRows())[0]!).getByRole('rowheader')).toHaveTextContent('Tempeh');
    });
  });

  it('shows totals by location and by month', async () => {
    await db.batches.bulkPut([batch('b1', '2026-09-10'), batch('b2', '2026-09-12', { purchase: { pricePaidMYR: myr(5), location: 'Tesco', date: '2026-09-12' } })]);
    renderScreen();
    const byLocation = await screen.findByTestId('totals-location');
    expect(within(byLocation).getByRole('row', { name: /Pasar/ })).toHaveTextContent('RM20.00');
    expect(within(screen.getByTestId('totals-month')).getByRole('row', { name: /Sep 2026/ })).toHaveTextContent('RM25.00');
  });

  it('exports the purchases in view, named for the range', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    await screen.findByTestId('purchase-table');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export purchases (CSV)' }));
    const [name, mime, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-purchases-2026-09.csv');
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(text.startsWith('﻿date,ingredient,location')).toBe(true);
    expect(text).toContain('b1');
  });

  it('disables the meals export when no meal falls in the range', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    await screen.findByTestId('purchase-table');
    expect(screen.getByRole('button', { name: 'Export meals (CSV)' })).toBeDisabled();
  });

  it('exports meals with the profile name', async () => {
    await db.mealEntries.put({
      id: 'q1', profileId: 'p1', date: '2026-09-20', label: 'snack', createdAt: 1,
      kind: 'quick', name: 'Teh tarik', kcal: 120,
    });
    render(
      <CostsScreen
        profiles={[{ id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' }]}
        onDataReplaced={() => {}}
        today={TODAY}
      />,
    );
    const button = screen.getByRole('button', { name: 'Export meals (CSV)' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    const [name, , text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-meals-2026-09.csv');
    expect(text).toContain('2026-09-20,Ali,snack,quick,Teh tarik,,,120,,,');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/screens/CostsScreen.test.tsx`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SORT, ingredientLookup, inRange, MEAL_CSV_HEADERS, mealCsvRows, nextSort,
  PURCHASE_CSV_HEADERS, purchaseCsvRows, purchaseRows, rangeFileTag, sortRows, summarise,
  totalsByLocation, totalsByMonth, type CostRange, type Sort,
} from '../../core/costs';
import { toCsv } from '../../core/csv';
import type { MealContext } from '../../core/meals';
import type { Ingredient, Profile } from '../../core/types';
import { formatMYR } from '../../core/units';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { INGREDIENTS } from '../../data/ingredients';
import { RETENTION } from '../../data/retentionTable';
import { listUserIngredients } from '../../storage/userIngredients';
import { DataPanel } from '../components/DataPanel';
import { PurchaseTable } from '../components/PurchaseTable';
import { RangePicker } from '../components/RangePicker';
import { TotalsList } from '../components/TotalsList';
import { todayIso } from '../dates';
import { downloadText } from '../download';
import { entryItemName } from '../labels';
import { useKitchen } from '../useKitchen';

const CSV_MIME = 'text/csv;charset=utf-8';

/**
 * Every user ingredient, archived included, which is what `useCatalogue` is
 * built not to return (spec §3.1). A failed read leaves names unresolved
 * rather than blocking the screen; `useKitchen`'s banner covers a dead store.
 */
function useAllUserIngredients() {
  const [list, setList] = useState<Ingredient[]>([]);
  const refresh = useCallback(async () => {
    try {
      const loaded = await listUserIngredients();
      setList(loaded);
    } catch (err) {
      console.error('Loading your ingredients failed', err);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { list, refresh };
}

interface Props {
  profiles: readonly Profile[];
  /** A restore has rewritten storage; the app re-reads what it holds. */
  onDataReplaced: () => void;
  today?: Date;
}

export function CostsScreen({ profiles, onDataReplaced, today = new Date() }: Props) {
  const kitchen = useKitchen();
  const user = useAllUserIngredients();
  const [range, setRange] = useState<CostRange>('thisMonth');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const todayStr = todayIso(today);

  const lookup = useMemo(() => ingredientLookup(INGREDIENTS, user.list), [user.list]);

  const rows = useMemo(
    () => purchaseRows(kitchen.batches, kitchen.sessions, lookup, RETENTION)
      .filter((r) => inRange(r.date, range, todayStr)),
    [kitchen.batches, kitchen.sessions, lookup, range, todayStr],
  );
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const entries = useMemo(
    () => kitchen.entries.filter((e) => inRange(e.date, range, todayStr)),
    [kitchen.entries, range, todayStr],
  );

  const ctx: MealContext = useMemo(() => ({
    sessions: kitchen.sessions,
    batches: kitchen.batches,
    ingredientById: lookup,
    samples: kitchen.samples,
    categoryYield: CATEGORY_YIELD,
    retention: RETENTION,
  }), [kitchen.sessions, kitchen.batches, kitchen.samples, lookup]);

  const tag = rangeFileTag(range, todayStr);

  const exportPurchases = sorted.length === 0 ? null : () => {
    downloadText(`ingcalc-purchases-${tag}.csv`, CSV_MIME, toCsv(PURCHASE_CSV_HEADERS, purchaseCsvRows(sorted)));
  };

  const exportMeals = entries.length === 0 ? null : () => {
    const rowsOut = mealCsvRows(entries, ctx, {
      profileName: (id) => profiles.find((p) => p.id === id)?.name,
      itemName: (e) => entryItemName(e, ctx),
    });
    downloadText(`ingcalc-meals-${tag}.csv`, CSV_MIME, toCsv(MEAL_CSV_HEADERS, rowsOut));
  };

  const onRestored = () => {
    void kitchen.refresh();
    void user.refresh();
    onDataReplaced();
  };

  const summary = summarise(rows);
  const { loading, storageError } = kitchen;

  return (
    <section className="screen">
      <h2>Costs</h2>

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <RangePicker value={range} onChange={setRange} />

      {!loading && storageError === null && kitchen.batches.length === 0 && (
        <p className="screen__hint" data-testid="costs-empty">
          Nothing bought yet — purchases you log in Kitchen appear here.
        </p>
      )}

      {!loading && kitchen.batches.length > 0 && rows.length === 0 && (
        <p className="screen__hint" data-testid="costs-none-in-range">Nothing bought in this period.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="costs__summary" data-testid="costs-summary">
            {formatMYR(summary.spentMYR)} · {summary.count} purchase{summary.count === 1 ? '' : 's'} ·{' '}
            {summary.proteinPerMYR === null ? '—' : summary.proteinPerMYR.toFixed(1)} g protein per RM
          </p>

          <div className="card">
            <h3 className="card__title">Purchases</h3>
            <PurchaseTable rows={sorted} sort={sort} onSort={(key) => setSort(nextSort(sort, key))} />
          </div>

          <TotalsList
            title="By location"
            keyHeading="Location"
            rows={totalsByLocation(rows)}
            showShare
            testId="totals-location"
          />
          <TotalsList title="By month" keyHeading="Month" rows={totalsByMonth(rows)} testId="totals-month" />
        </>
      )}

      <DataPanel
        onExportPurchases={exportPurchases}
        onExportMeals={exportMeals}
        onRestored={onRestored}
        today={today}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/screens/CostsScreen.test.tsx`
Expected: PASS. If `npm run lint` flags `useAllUserIngredients`'s effect under
`react/set-state-in-effect`, that is a new warning and a regression. Restructure to the
generation-ref pattern `useKitchen` uses (a `fetchAll(gen)` callback and an effect that
calls it), which the linter already accepts. Do not suppress the rule.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/ui/screens/CostsScreen.tsx src/ui/screens/CostsScreen.test.tsx
git commit -m "feat: add the Costs screen"
```

---

## Task 14: Turn on the Costs tab

**Files:**
- Modify: `src/ui/App.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `CostsScreen` (Task 13)

- [ ] **Step 1: Update the tests**

In `src/ui/App.test.tsx`:

1. Clear every table in `beforeEach`. Replace the individual `clear()` calls with
   `await Promise.all(db.tables.map((t) => t.clear()));`, keeping the comment about why.
2. Replace the test `'disables the tabs that arrive in later phases'` with:

```tsx
  it('enables every tab now that Costs has arrived', async () => {
    render(<App />);
    for (const name of ['Log', 'Kitchen', 'Calc', 'Costs', 'Profile']) {
      expect(await screen.findByRole('tab', { name })).toBeEnabled();
    }
  });

  it('opens the Costs screen', async () => {
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Costs' }));
    expect(await screen.findByRole('heading', { name: 'Costs' })).toBeInTheDocument();
  });

  it('shows the restored profile in the header after a replace', async () => {
    const fixture = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Costs' }));
    await user.upload(
      await screen.findByLabelText(/restore from backup/i),
      new File([fixture], 'backup.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await user.click(await screen.findByRole('button', { name: 'Erase and restore' }));
    expect(await screen.findByText('Ali', { selector: '.app__profile' })).toBeInTheDocument();
  });
```

Add `import { readFileSync } from 'node:fs';` and `import { join } from 'node:path';`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the three new tests FAIL (the Costs tab is disabled).

- [ ] **Step 3: Implement**

In `src/ui/App.tsx`:

```tsx
import { CostsScreen } from './screens/CostsScreen';
```

```tsx
const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs' },
  { id: 'profile', label: 'Profile' },
];

/** Tabs that actually exist. A stored preference for any other tab falls back to Log. */
const BUILT: readonly Tab[] = ['log', 'kitchen', 'calc', 'costs', 'profile'];
```

Inside the `ErrorBoundary`, after the `calc` line:

```tsx
          {tab === 'costs' && (
            <CostsScreen profiles={profiles} onDataReplaced={() => { void refresh(); }} />
          )}
```

In the tab bar, remove the now-dead phase machinery: the `disabled`, `title` and
`tab__phase` span go. The button becomes:

```tsx
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
          >
            <span>{t.label}</span>
          </button>
```

`refresh` from `useProfiles` re-reads profiles **and** settings, so a replace that brings a
different active profile shows it in the header. See deviation 6 at the top of this plan
for why nothing is remounted.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat: turn on the Costs tab"
```

---

## Task 15: Styles

**Files:**
- Modify: `src/index.css`

No tests: CSS is verified by the visual pass in Task 16. Use only tokens from `:root`, each
of which the dark-mode block redefines.

- [ ] **Step 1: Remove the dead phase badge**

No tab is disabled any more. In `src/index.css`, delete the `.tab:disabled { … }` and
`.tab__phase { … }` rules, and replace

```css
.tab:not(:disabled):active {
  background: var(--surface-sunken);
}
```

with

```css
.tab:active {
  background: var(--surface-sunken);
}
```

- [ ] **Step 2: Append the Costs styles**

```css
/* ==========================================================================
   Costs
   ========================================================================== */

/* The segmented control, as a 2×2 grid on a phone and one row from 30rem. */
.range-picker {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin-bottom: var(--sp-4);
}

@media (min-width: 30rem) {
  .range-picker { grid-template-columns: repeat(4, 1fr); }
}

.range-picker .seg__btn { min-width: 0; font-size: var(--fs-sm); }

.costs__summary {
  margin: 0 0 var(--sp-4);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

/* Header cells are buttons, styled as the header text they replace. */
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-height: var(--tap-min);
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.purchase-table th[aria-sort] .sort-btn { color: var(--accent); }
.sort-btn__arrow { min-width: 0.75em; }

/* Pinned ingredient column: opaque, so scrolled cells pass under it. */
.purchase-table thead th:first-child,
.purchase-table tbody th[scope='row'] {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
}

.purchase-table tbody th[scope='row'] {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-panel__actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.data-panel__note {
  margin: 0 0 var(--sp-2);
  color: var(--text-dim);
  font-size: var(--fs-sm);
}

.data-panel__restore:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.data-panel__step { margin-top: var(--sp-4); }
.data-panel__step .btn-row { margin-top: var(--sp-3); }

.app [role='alert'] p { margin: 0; }
.app [role='alert'] p + p { margin-top: var(--sp-2); }

/* Destructive: only "Erase and restore" uses it. */
.btn--danger {
  background: var(--danger);
  color: var(--surface);
  border: 1px solid var(--danger);
  width: 100%;
}

.btn--danger:hover { filter: brightness(0.92); }

/* The export buttons are the first ordinary buttons that can be disabled;
   no rule for that existed. */
.app .btn:disabled { cursor: not-allowed; opacity: 0.55; }
```

- [ ] **Step 3: Run all three commands, then commit**

```bash
npm test && npm run build && npm run lint
git add src/index.css
git commit -m "style: add the Costs screen's styles"
```

---

## Task 16: Whole-branch verification

- [ ] **Step 1: Full suite, build, lint**

Run: `npm test && npm run build && npm run lint`
Expected: every test passes (637 plus this phase's), the build is clean, and there is
exactly one lint warning (the pre-existing `WeightInput.tsx:23`). Record the exact counts.

- [ ] **Step 2: Golden and purity suites untouched**

Run: `git diff main...HEAD --stat -- src/core/golden.test.ts` (expect no output), then
`npx vitest run src/core/golden.test.ts src/core/purity.test.ts` (expect PASS).
Note that `main` is at Phase 2. Compare against `phase-3-today` instead if that is the base
this branch was cut from: `git diff phase-3-today...HEAD --stat -- src/core/golden.test.ts`.

- [ ] **Step 3: Phone-width visual pass**

As Phase 3 §6: install `playwright-core` **into the session scratchpad, not the project**
(`package.json` must stay untouched), drive the installed Chrome against `npm run dev` at
390×844, `deviceScaleFactor: 2`, in both colour schemes. Measure
`document.documentElement.scrollWidth > innerWidth` at every step. Script the steps:

1. First run: create a profile.
2. Kitchen: log three purchases at two locations (one with a comma in its name, one
   dated last month), cook one.
3. Log: eat a portion of the cook.
4. Costs: screenshot. Check that the table scrolls **inside its box** (the box's
   `scrollWidth > clientWidth`) while the page does not, and that the pinned column is
   opaque over scrolled cells.
5. Sort by price, then again; screenshot both.
6. Switch to Last 3 months; the last-month purchase appears.
7. Export both CSVs (Playwright `download` events). Check each starts with the BOM, the
   comma-named location is quoted, and the meals file has one row.
8. Download the backup. Then Replace-restore it onto a **fresh browser context**. Kitchen
   and Log must show the same figures as before.
9. In the original context, merge the same backup and check that the preview says nothing
   is new.

Zero page errors, zero console errors and zero page-level horizontal overflow at every
step, in both schemes. Look at the dark-mode screenshots by eye: the danger button and the
pinned column's background are the new colour surfaces.

- [ ] **Step 4: Final whole-branch review**

Dispatch one reviewer over the whole branch diff with these instructions, beyond reading
the diff:

- Trace a merge of two devices' backups end to end and try to produce an orphan or a
  negative remainder.
- Check that every `console.error` added carries the real error.
- Confirm no new colour bypasses a token.
- Confirm the fixture file is unchanged since the commit that added it
  (`git log --follow src/storage/__fixtures__/backup-v3.json` shows one commit).

Apply the findings that are cheap *and* guard something load-bearing, as one fix wave.
Record the rest.

- [ ] **Step 5: Execution record**

Write `docs/superpowers/2026-09-23-phase-4-execution-record.md` in the shape of the Phase 3
record: what shipped, where the plan was wrong, deferred items with locations, what was
verified and how (including what was **not**: a real phone, iOS Safari's download
behaviour), process notes, and what Phase 5 (or maintenance) inherits. Commit it.

```bash
git add docs/superpowers/2026-09-23-phase-4-execution-record.md
git commit -m "docs: add the Phase 4 execution record"
```

---

## Plan self-review

**Spec coverage** (spec § → task):

| Spec | Task |
|---|---|
| §2 module layout | 2, 4–13 (with the deviations listed at the top) |
| §3.1 data, archived ingredients, tab enabled | 4 (`ingredientLookup`), 13, 14 |
| §3.2 ranges | 4 |
| §3.3 weighted summary | 4, 13 |
| §3.4 table, sorting, nulls last, aria-sort, sticky column | 5, 11, 15 |
| §3.5–3.6 totals | 5, 10, 13 |
| §3.7 states | 13 |
| §4.1 CSV rules | 2 |
| §4.2 rounding | 6 |
| §4.3–4.4 the two files | 6, 13 |
| §4.5 `entryCostMYR` + invariant | 3 |
| §4.6 download and filenames | 4 (`rangeFileTag`), 10, 12, 13 |
| §5.1 file format, version = `db.verno` | 7, 9 |
| §5.2 backup in one read transaction | 9 |
| §5.3 steps 1–4 | 7, 12 |
| §5.3 step 5 integrity + lifecycle + coercion | 8 |
| §5.3 step 6 preview copy | 8, 12 |
| §5.3 step 7 write, re-plan in the transaction, rollback | 9 |
| §5.3 step 8 refresh | 13, 14 (deviation 6) |
| §5.4 merge semantics | 8, 9 |
| §6 Data panel | 12 |
| §7 error handling | 9, 12 |
| §8 testing, fixture, visual pass | every task, 8, 16 |
| §9 threads pool | 1 |

**Type consistency:** `BackupTables`, `RestorePlan`, `RestoreMode`, `Result` are defined
once in Task 7/8 and imported everywhere else. `PurchaseRow` gains `proteinRawG` in Task 4,
and every later fixture (Tasks 5, 11) includes it. `SortKey` is the eight-column union in
Task 5, and `PurchaseTable`'s `COLUMNS` uses exactly those eight keys. `DataPanel`'s
`onRestored` is fed by `CostsScreen.onRestored`, which calls `App`'s `onDataReplaced`.
