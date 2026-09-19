# IngCalc Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track a purchase from the market through cooking to the last portion eaten, and feed the user's own measured yields back into the calculator.

**Architecture:** Three new pure modules in `src/core/` (`batch.ts`, `calibration.ts`, `cost.ts`) hold every rule and every number. Dexie schema version 2 adds two tables underneath them, and a thin `src/storage/kitchen.ts` does nothing but read and write rows. The Kitchen screen composes Phase 1's existing `IngredientPicker` and `WeightInput`. The payoff is one line: `resolveYield` finally receives samples, so `CalcScreen`'s published figures become measured ones.

**Tech Stack:** React 19 + TypeScript 6 + Vite 8, Dexie 4 over IndexedDB, Vitest 4 with jsdom and `fake-indexeddb`, Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-kitchen-design.md`, which is an addendum to `docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md`. Read both; the addendum records where this phase departs from the parent.

## Global Constraints

- **Node 22.12.0.** `.nvmrc` pins it and `package.json` requires `>=22.12.0`. The shell may default to 22.7.0, on which the test suite cannot even start (jsdom's `html-encoding-sniffer` needs `require(esm)`, unflagged only from 22.12.0). **Prefix every command:** `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"`.
- **Baseline at branch point:** 24 test files, 285 tests passing; `npm run build` clean; `npm run lint` exits 0 with one pre-existing warning in `src/ui/components/WeightInput.tsx:23`. Do not "fix" that warning in this phase.
- **Branch:** `phase-2-kitchen`, already created from `main` at commit `981ec03`.
- **Core purity.** Nothing in `src/core/` may import from `src/ui/`, `src/storage/` or `react`. Reference tables are passed in as arguments, never imported — this is what makes the golden-value tests possible. `src/core/` may import only from `src/core/`.
- **Branded types.** Weights are `Grams` (`src/core/units.ts`), money is `MYR`. Construct them only through `g()` and `myr()`, which reject negative and non-finite values. Never cast with `as Grams`.
- **Grams are authoritative; portions are a view over them.** Every quantity is stored in grams. Portion counts are derived on read. Parent spec §3.
- **Derive what has an event log, store what does not.** `rawRemainingG` is derived from cook sessions. `cookedRemainingG` is stored, because eating writes no record until Phase 3. Addendum §3.
- **Float tolerance:** `EPSILON = 0.005` grams, exported from `src/core/batch.ts`. Compare weights through it; never `===`.
- **Outlier tolerance:** `DEVIATION_TOLERANCE = 0.35`, `HARD_BOUND_MULTIPLE = 3`, both exported from `src/core/calibration.ts`. Addendum §2.4.
- **Yield bounds come from the reference factor, never from `absorbsWater`.** Three bundled vegetables publish boiled yields above 1 with `absorbsWater: false` (sawi 1.04, bayam 1.04, cabbage 1.07), the `vegetable.boiled` category default is 1.05, and boiled rolled oats are published at 6.65. A gate resting on that boolean rejects correct cooks. Addendum §2.4.
- **Number formatting:** `toLocaleString('en-MY', ...)`, matching Phase 1.
- **Copy rule.** Messages shown to the user state the actual remaining quantity, never just "invalid". Parent spec §6.
- **Commit style:** `feat:`, `fix:`, `test:`, `refactor:` prefixes, as on the Phase 1 branch.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/core/batch.ts` | Derived batch/session quantities; the cook, eat and correction guards |
| `src/core/batch.test.ts` | Lifecycle invariants and guard boundaries |
| `src/core/calibration.ts` | Sessions → `YieldSample[]`; the outlier flag |
| `src/core/calibration.test.ts` | Join correctness; flag boundaries |
| `src/core/cost.ts` | Cost per kg raw/cooked, per portion, protein per MYR |
| `src/core/cost.test.ts` | Cost arithmetic including partial-batch apportioning |
| `src/storage/kitchen.ts` | Batch and session rows; cascading delete |
| `src/storage/kitchen.test.ts` | Round-trips and cascade |
| `src/storage/migration.test.ts` | v1 → v2 upgrade preserves Phase 1 data |
| `src/ui/useKitchen.ts` | Loads both tables, exposes `samples` and `refresh` |
| `src/ui/useKitchen.test.ts` | Load, refresh, storage-failure fallback |
| `src/ui/components/YieldBadge.tsx` | Renders `ResolvedYield` provenance |
| `src/ui/components/YieldBadge.test.tsx` | All three sources |
| `src/ui/components/AddBatchForm.tsx` | Create and edit a batch |
| `src/ui/components/AddBatchForm.test.tsx` | Validation, create, edit |
| `src/ui/components/CookSessionForm.tsx` | Create and edit a cook session |
| `src/ui/components/CookSessionForm.test.tsx` | Defaulting, blocking, outlier warning |
| `src/ui/components/EatControl.tsx` | Eat one portion or a weighed amount |
| `src/ui/components/EatControl.test.tsx` | Both paths, over-eating blocked |
| `src/ui/components/SessionRow.tsx` | One cook session: yield, flag, exclude, eat |
| `src/ui/components/SessionRow.test.tsx` | Flag display, exclude toggle |
| `src/ui/components/BatchCard.tsx` | One batch: state, remainder, cost, actions |
| `src/ui/components/BatchCard.test.tsx` | Flat single-session rendering, delete confirm |
| `src/ui/screens/KitchenScreen.tsx` | Groups batches by derived state |
| `src/ui/screens/KitchenScreen.test.tsx` | Grouping, empty state, add flow |

**Modified**

| File | Change |
|---|---|
| `src/core/types.ts` | Add `IsoDate`, `Purchase`, `Batch`, `CookSession` |
| `src/core/units.ts` | Add `formatG` |
| `src/storage/db.ts` | Schema v2; exported schema constants; blocked/timeout fix |
| `src/ui/labels.ts` | Add `STATE_LABELS`, `yieldSentence` |
| `src/ui/screens/CalcScreen.tsx` | Real samples; "log this as a batch" |
| `src/ui/App.tsx` | Enable the Kitchen tab |
| `src/index.css` | Kitchen classes |

**Two names differ from the addendum, deliberately:**

1. The addendum calls the outlier function `flagSession`. It is `flagYield` here and takes a `YieldObservation` (`{ method, rawUsedG, cookedWeightG }`) rather than a whole `CookSession`, because the cook form must flag a draft *before* a session exists. `CookSession` structurally satisfies `YieldObservation`, so a stored session can still be passed directly.
2. `OutlierFlag.referenceFactor` is always present. For `kind: 'implausible'` it is informational only — the flag does not depend on it.

---

## Task 1: Domain types and derived batch quantities

**Files:**
- Modify: `src/core/types.ts` (append after the `Profile` interface, before `YieldSample`)
- Modify: `src/core/units.ts` (append)
- Create: `src/core/batch.ts`
- Test: `src/core/batch.test.ts`

**Interfaces:**
- Consumes: `Grams`, `MYR`, `g` from `src/core/units.ts`; `CookMethod` from `src/core/types.ts`
- Produces:
  - `type IsoDate = string`, `interface Purchase`, `interface Batch`, `interface CookSession` (in `types.ts`)
  - `formatG(v: Grams): string` (in `units.ts`)
  - `EPSILON: number`, `type BatchState`, `sessionsOf`, `rawRemainingG`, `batchState`, `portionWeightG`, `portionsRemaining` (in `batch.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/core/batch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Batch, CookSession } from './types';
import { g, myr } from './units';
import {
  batchState, portionsRemaining, portionWeightG, rawRemainingG, sessionsOf,
} from './batch';

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1',
  ingredientId: 'chicken-breast',
  rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(18.5), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 1_758_240_000_000,
  ...over,
});

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1',
  batchId: 'b1',
  method: 'roasted',
  rawUsedG: g(400),
  cookedWeightG: g(300),
  cookedRemainingG: g(300),
  cookedAt: '2026-09-19',
  portionCount: 2,
  excludeFromCalibration: false,
  ...over,
});

describe('sessionsOf', () => {
  it('keeps only the sessions belonging to the batch', () => {
    const mine = session({ id: 's1', batchId: 'b1' });
    const theirs = session({ id: 's2', batchId: 'b2' });
    expect(sessionsOf('b1', [mine, theirs])).toEqual([mine]);
  });
});

describe('rawRemainingG', () => {
  it('is the whole purchase when nothing has been cooked', () => {
    expect(rawRemainingG(batch(), [])).toBe(1000);
  });

  it('subtracts every session of this batch, ignoring other batches', () => {
    const sessions = [
      session({ id: 's1', rawUsedG: g(400) }),
      session({ id: 's2', rawUsedG: g(250) }),
      session({ id: 's3', batchId: 'b2', rawUsedG: g(900) }),
    ];
    expect(rawRemainingG(batch(), sessions)).toBe(350);
  });

  it('clamps at zero rather than returning a negative weight', () => {
    // An edit that shrinks rawWeightG below what is already cooked is blocked
    // elsewhere, but g() throws on negatives, so this must never produce one.
    const sessions = [session({ rawUsedG: g(1200) })];
    expect(rawRemainingG(batch(), sessions)).toBe(0);
  });
});

describe('batchState', () => {
  it('is raw when no session exists', () => {
    expect(batchState(batch(), [])).toBe('raw');
  });

  it('is partiallyCooked while raw weight is left', () => {
    expect(batchState(batch(), [session({ rawUsedG: g(400) })])).toBe('partiallyCooked');
  });

  it('is cooked once all the raw is used but food remains', () => {
    const s = session({ rawUsedG: g(1000), cookedWeightG: g(750), cookedRemainingG: g(750) });
    expect(batchState(batch(), [s])).toBe('cooked');
  });

  it('is finished when all the raw is used and nothing is left to eat', () => {
    const s = session({ rawUsedG: g(1000), cookedWeightG: g(750), cookedRemainingG: g(0) });
    expect(batchState(batch(), [s])).toBe('finished');
  });

  it('stays partiallyCooked when raw is left even if every cooked portion is gone', () => {
    const s = session({ rawUsedG: g(400), cookedRemainingG: g(0) });
    expect(batchState(batch(), [s])).toBe('partiallyCooked');
  });

  it('treats a sub-epsilon remainder as fully cooked, not as a sliver left over', () => {
    const s = session({ rawUsedG: g(999.999), cookedWeightG: g(750), cookedRemainingG: g(750) });
    expect(batchState(batch(), [s])).toBe('cooked');
  });
});

describe('portionWeightG', () => {
  it('divides the cooked weight by the portion count', () => {
    expect(portionWeightG(session({ cookedWeightG: g(296), portionCount: 2 }))).toBe(148);
  });

  it('refuses a portion count below one, which has no defined portion weight', () => {
    expect(() => portionWeightG(session({ portionCount: 0 }))).toThrow(RangeError);
  });
});

describe('portionsRemaining', () => {
  it('follows grams rather than whole portions', () => {
    // The parent spec's awkward case: a 100g serving out of a 148g portion.
    const s = session({ cookedWeightG: g(296), portionCount: 2, cookedRemainingG: g(196) });
    expect(portionsRemaining(s)).toBeCloseTo(1.324, 3);
  });

  it('is zero for a session that produced nothing', () => {
    expect(portionsRemaining(session({ cookedWeightG: g(0), cookedRemainingG: g(0) }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/core/batch.test.ts
```

Expected: FAIL — `Failed to resolve import "./batch"`.

- [ ] **Step 3: Add the domain types**

In `src/core/types.ts`, change the first import line to bring in `MYR`:

```ts
import type { Grams, MYR } from './units';
```

Then append after the `Profile` interface:

```ts
/** 'YYYY-MM-DD'. Local calendar date, not an instant: which day you shopped. */
export type IsoDate = string;

export interface Purchase {
  pricePaidMYR: MYR;
  location: string;
  date: IsoDate;
}

/**
 * One purchase, household-level: you shop once for the house but eat as an
 * individual.
 *
 * There is deliberately no `rawRemainingG` field. Cook sessions are an event
 * log of raw consumption, so the remainder is always recoverable from them —
 * storing it as well would be a second source of truth that editing could put
 * out of step with the first. See `rawRemainingG()` in `./batch`.
 */
export interface Batch {
  id: string;
  ingredientId: string;
  rawWeightG: Grams;
  purchase: Purchase;
  createdAt: number;
}

/**
 * One cooking event, and simultaneously one yield observation: it records the
 * ingredient (through its batch), the method, the raw weight in and the cooked
 * weight out. That is why Phase 2 needs no separate calibration table.
 */
export interface CookSession {
  id: string;
  batchId: string;
  method: CookMethod;
  rawUsedG: Grams;
  /** Measured by the user on a scale, never derived from a yield factor. */
  cookedWeightG: Grams;
  /**
   * Authoritative remaining quantity. Stored rather than derived because
   * eating writes no record until Phase 3 introduces meals.
   */
  cookedRemainingG: Grams;
  cookedAt: IsoDate;
  portionCount: number;
  /** The day you forgot to drain it: kept, but excluded from the yield mean. */
  excludeFromCalibration: boolean;
}
```

- [ ] **Step 4: Add the weight formatter**

Append to `src/core/units.ts`:

```ts
/**
 * Weights shown to the user. Whole grams above 10g, where a decimal would be
 * false precision on a kitchen scale; one decimal below it, where dropping it
 * would round a real 2.4g to "2g".
 */
export const formatG = (v: Grams): string =>
  `${v.toLocaleString('en-MY', { maximumFractionDigits: v < 10 ? 1 : 0 })}g`;
```

- [ ] **Step 5: Write the implementation**

Create `src/core/batch.ts`:

```ts
import type { Batch, CookSession } from './types';
import { g, type Grams } from './units';

/**
 * Half a hundredth of a gram. Weights arrive from division (portion weights)
 * and from user input in kilograms, so exact comparison would report a sliver
 * of raw meat left on a batch that was entirely cooked.
 */
export const EPSILON = 0.005;

export type BatchState = 'raw' | 'partiallyCooked' | 'cooked' | 'finished';

export const sessionsOf = (
  batchId: string,
  sessions: readonly CookSession[],
): CookSession[] => sessions.filter((s) => s.batchId === batchId);

export function rawRemainingG(batch: Batch, sessions: readonly CookSession[]): Grams {
  const used = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0);
  return g(Math.max(0, batch.rawWeightG - used));
}

/**
 * Never stored, per the parent spec. A stored status would have to be updated
 * at every transition, and the transitions are exactly where it would go wrong.
 */
export function batchState(batch: Batch, sessions: readonly CookSession[]): BatchState {
  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return 'raw';
  if (rawRemainingG(batch, sessions) > EPSILON) return 'partiallyCooked';
  const left = mine.reduce((sum, s) => sum + s.cookedRemainingG, 0);
  return left > EPSILON ? 'cooked' : 'finished';
}

export function portionWeightG(session: CookSession): Grams {
  if (session.portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${session.portionCount}`);
  }
  return g(session.cookedWeightG / session.portionCount);
}

/**
 * Derived from grams, not counted down. Eating a weighed 100g out of a 148g
 * portion has to mean something, and "0.68 portions gone" is the only answer
 * consistent with the grams actually leaving the container.
 */
export function portionsRemaining(session: CookSession): number {
  if (session.cookedWeightG <= 0) return 0;
  return session.cookedRemainingG / portionWeightG(session);
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run src/core/batch.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 7: Confirm nothing else broke**

```bash
npx vitest run && npx tsc -b
```

Expected: 285 + 14 tests pass; `tsc` silent.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/units.ts src/core/batch.ts src/core/batch.test.ts
git commit -m "feat: add batch and cook session types with derived quantities

rawRemainingG is derived from the session log rather than stored, so editing
a batch cannot put two sources of truth out of step. portionsRemaining is
derived from grams, which is what makes a weighed serving out of a portion
well defined."
```

---

## Task 2: Calibration — reference factor, bounds, and the outlier flag

This task comes before the guards because `validateCook` rejects using the same
bounds that `flagYield` reports. Deriving them once, here, is what stops entry
and flagging from disagreeing about what is possible.

**Files:**
- Create: `src/core/calibration.ts`
- Test: `src/core/calibration.test.ts`

**Interfaces:**
- Consumes: `Batch`, `CookSession`, `Ingredient`, `CookMethod`, `YieldSample` from `src/core/types.ts`; `CategoryYield` from `src/core/yieldResolver.ts`; `formatG`, `Grams` from `src/core/units.ts`
- Produces: `DEVIATION_TOLERANCE`, `HARD_BOUND_MULTIPLE`, `interface YieldObservation`, `referenceFactor`, `interface YieldBounds`, `yieldBounds`, `observedFactor`, `interface OutlierFlag`, `flagYield`, `toYieldSamples`

- [ ] **Step 1: Write the failing test**

Create `src/core/calibration.test.ts`. The regression cases deliberately read
the real bundled tables rather than fixtures — a fixture cannot catch the
bundled data drifting out from under this rule:

```ts
import { describe, it, expect } from 'vitest';
import type { Batch, CookSession, Ingredient } from './types';
import { g, myr } from './units';
import { zeroNutrients } from './nutrients';
import { INGREDIENTS } from '../data/ingredients';
import { CATEGORY_YIELD } from '../data/categoryYield';
import {
  flagYield, observedFactor, referenceFactor, toYieldSamples, yieldBounds,
} from './calibration';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

/** publishedYield.boiled is exactly 1, which keeps the ±35% boundary arithmetic exact. */
const flat: Ingredient = {
  id: 'flat', name: 'Test food', category: 'other',
  per100gRaw: { ...zeroNutrients(), protein: 10 },
  publishedYield: { boiled: 1 }, absorbsWater: false,
  source: 'user', archived: false,
};

const obs = (rawUsedG: number, cookedWeightG: number, method = 'boiled' as const) =>
  ({ method, rawUsedG: g(rawUsedG), cookedWeightG: g(cookedWeightG) });

describe('referenceFactor', () => {
  it('prefers the ingredient published factor', () => {
    expect(referenceFactor(bundled('cabbage'), 'boiled', CATEGORY_YIELD)).toBe(1.07);
  });

  it('falls back to the category default when the method has no published factor', () => {
    // Cabbage publishes no roasted factor; vegetable.roasted is 0.75.
    expect(referenceFactor(bundled('cabbage'), 'roasted', CATEGORY_YIELD)).toBe(0.75);
  });
});

describe('yieldBounds', () => {
  it('spans a third of the reference to three times it', () => {
    expect(yieldBounds(0.75)).toEqual({ min: 0.25, max: 2.25 });
  });
});

describe('observedFactor', () => {
  it('is cooked over raw', () => {
    expect(observedFactor(obs(400, 300))).toBe(0.75);
  });

  it('is zero rather than Infinity when no raw weight was recorded', () => {
    expect(observedFactor(obs(0, 300))).toBe(0);
  });
});

describe('flagYield', () => {
  it('passes a cook that matches the reference', () => {
    expect(flagYield(obs(400, 400), flat, CATEGORY_YIELD)).toBeNull();
  });

  // The threshold is tested just inside and just outside rather than exactly on
  // it: |1.35 - 1| / 1 evaluates to 0.35000000000000009 in binary floating point,
  // so an assertion "at exactly 35%" would be testing IEEE 754, not this rule.
  it('passes a cook 34% off the reference', () => {
    expect(flagYield(obs(100, 134), flat, CATEGORY_YIELD)).toBeNull();
  });

  it('flags a cook 36% off the reference as a deviation', () => {
    const flag = flagYield(obs(100, 136), flat, CATEGORY_YIELD);
    expect(flag?.kind).toBe('deviation');
    expect(flag?.reason).toContain('136%');
    expect(flag?.reason).toContain('100%');
  });

  it('flags a transposed digit as implausible', () => {
    const flag = flagYield(obs(400, 4000), flat, CATEGORY_YIELD);
    expect(flag?.kind).toBe('implausible');
    expect(flag?.reason).toContain('4,000g');
  });

  it('flags a cook that lost almost everything as implausible', () => {
    expect(flagYield(obs(400, 30), flat, CATEGORY_YIELD)?.kind).toBe('implausible');
  });

  it('accepts boiled cabbage gaining weight, though absorbsWater is false', () => {
    // Regression: an earlier rule blocked cooked > raw unless absorbsWater was
    // set. Cabbage publishes boiled at 1.07 and is marked absorbsWater: false.
    const cabbage = bundled('cabbage');
    expect(cabbage.absorbsWater).toBe(false);
    expect(flagYield(obs(500, 535), cabbage, CATEGORY_YIELD)).toBeNull();
  });

  it('accepts boiled rolled oats at 6.65x, far above any fixed ceiling', () => {
    // Regression: an earlier rule capped absorbing ingredients at 3.0.
    expect(flagYield(obs(100, 665), bundled('rolled-oats'), CATEGORY_YIELD)).toBeNull();
  });

  it('judges nothing when no raw weight was recorded', () => {
    expect(flagYield(obs(0, 300), flat, CATEGORY_YIELD)).toBeNull();
  });
});

describe('toYieldSamples', () => {
  const batch = (id: string, ingredientId: string): Batch => ({
    id, ingredientId, rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(10), location: 'Pasar', date: '2026-09-19' },
    createdAt: 0,
  });

  const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
    id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(300),
    cookedRemainingG: g(300), cookedAt: '2026-09-19', portionCount: 2,
    excludeFromCalibration: false, ...over,
  });

  it('carries the ingredient down from the batch onto each sample', () => {
    const samples = toYieldSamples([batch('b1', 'chicken-breast')], [session('s1', 'b1')]);
    expect(samples).toEqual([{
      ingredientId: 'chicken-breast', method: 'roasted',
      rawUsedG: 400, cookedWeightG: 300, excludeFromCalibration: false,
    }]);
  });

  it('carries the exclusion flag through, so resolveYield can honour it', () => {
    const samples = toYieldSamples(
      [batch('b1', 'chicken-breast')],
      [session('s1', 'b1', { excludeFromCalibration: true })],
    );
    expect(samples[0]!.excludeFromCalibration).toBe(true);
  });

  it('drops a session whose batch no longer exists', () => {
    // deleteBatchCascade should prevent orphans, but a sample with no
    // ingredient would silently calibrate the wrong food if one survived.
    expect(toYieldSamples([batch('b1', 'chicken-breast')], [session('s9', 'gone')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/core/calibration.test.ts
```

Expected: FAIL — `Failed to resolve import "./calibration"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/calibration.ts`:

```ts
import type { Batch, CookMethod, CookSession, Ingredient, YieldSample } from './types';
import type { CategoryYield } from './yieldResolver';
import { formatG, type Grams } from './units';

/**
 * How far a cook may sit from the reference figure before it is worth
 * mentioning. Deliberately loose: a real kitchen differs from USDA's, and this
 * rule exists to catch a transposed digit, not to police technique.
 */
export const DEVIATION_TOLERANCE = 0.35;

/**
 * Outside a third of the reference to three times it, a reading is treated as
 * impossible rather than unusual. Three times catches every order-of-magnitude
 * slip while admitting every factor the bundled data itself publishes — up to
 * boiled rolled oats at 6.65.
 */
export const HARD_BOUND_MULTIPLE = 3;

/**
 * The parts of a cook that constitute a yield reading. A stored `CookSession`
 * satisfies this structurally, so it can be passed directly; the cook form
 * passes a draft, because a session does not exist yet at the point the user
 * most needs to be warned.
 */
export interface YieldObservation {
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
}

/**
 * What this ingredient and method are expected to yield. Published factor
 * first, category default second — the same precedence `resolveYield` uses for
 * its non-measured branches.
 */
export const referenceFactor = (
  ingredient: Ingredient,
  method: CookMethod,
  categoryYield: CategoryYield,
): number => ingredient.publishedYield[method] ?? categoryYield[ingredient.category][method];

export interface YieldBounds {
  min: number;
  max: number;
}

export const yieldBounds = (reference: number): YieldBounds => ({
  min: reference / HARD_BOUND_MULTIPLE,
  max: reference * HARD_BOUND_MULTIPLE,
});

export const observedFactor = (obs: YieldObservation): number =>
  obs.rawUsedG <= 0 ? 0 : obs.cookedWeightG / obs.rawUsedG;

export interface OutlierFlag {
  kind: 'deviation' | 'implausible';
  observedFactor: number;
  /** Context only when `kind` is 'implausible'; the bounds did the deciding. */
  referenceFactor: number;
  /** Shown to the user verbatim. */
  reason: string;
}

const pct = (factor: number): string => `${Math.round(factor * 100)}%`;

/**
 * Advisory. Returns null for a cook worth nothing more than recording.
 *
 * Both bands are measured against the reference factor rather than against
 * `absorbsWater`, because that boolean cannot express what the data shows:
 * cabbage loses mass steamed and gains it boiled. The reference is already per
 * ingredient and per method.
 */
export function flagYield(
  obs: YieldObservation,
  ingredient: Ingredient,
  categoryYield: CategoryYield,
): OutlierFlag | null {
  if (obs.rawUsedG <= 0) return null;

  const reference = referenceFactor(ingredient, obs.method, categoryYield);
  if (reference <= 0) return null;

  const observed = observedFactor(obs);
  const bounds = yieldBounds(reference);

  if (observed < bounds.min || observed > bounds.max) {
    return {
      kind: 'implausible',
      observedFactor: observed,
      referenceFactor: reference,
      reason:
        `${formatG(obs.rawUsedG)} raw becoming ${formatG(obs.cookedWeightG)} cooked is ` +
        `${pct(observed)} of the raw weight, where ${pct(reference)} is typical. ` +
        'Check both weights.',
    };
  }

  if (Math.abs(observed - reference) / reference > DEVIATION_TOLERANCE) {
    return {
      kind: 'deviation',
      observedFactor: observed,
      referenceFactor: reference,
      reason: `This cook kept ${pct(observed)} of the raw weight, where ${pct(reference)} is typical.`,
    };
  }

  return null;
}

/**
 * The join that finally reaches `resolveYield`'s measured branch — dead code
 * since Phase 1, because nothing produced samples.
 *
 * A session knows only its batch, and the batch knows the ingredient. Joining
 * here rather than denormalising `ingredientId` onto the session keeps one
 * source of truth for which food a cook was; at this app's scale the cost is a
 * Map build over a few hundred rows.
 */
export function toYieldSamples(
  batches: readonly Batch[],
  sessions: readonly CookSession[],
): YieldSample[] {
  const ingredientOf = new Map(batches.map((b) => [b.id, b.ingredientId]));
  const samples: YieldSample[] = [];

  for (const s of sessions) {
    const ingredientId = ingredientOf.get(s.batchId);
    // An orphan would otherwise calibrate whichever food it was guessed onto.
    if (ingredientId === undefined) continue;
    samples.push({
      ingredientId,
      method: s.method,
      rawUsedG: s.rawUsedG,
      cookedWeightG: s.cookedWeightG,
      excludeFromCalibration: s.excludeFromCalibration,
    });
  }

  return samples;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/core/calibration.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/calibration.ts src/core/calibration.test.ts
git commit -m "feat: add yield calibration with reference-derived outlier bounds

Bounds come from the ingredient and method reference factor rather than from
absorbsWater, which cannot express that cabbage loses mass steamed and gains it
boiled. Two bundled cases are pinned as regressions: boiled cabbage at 1.07 with
absorbsWater false, and boiled rolled oats at 6.65.

toYieldSamples is the join that reaches resolveYield's measured branch, dead
code since Phase 1 because nothing produced samples."
```

---

## Task 3: The cook and eat guards

**Files:**
- Modify: `src/core/batch.ts` (append; extend the import lines)
- Test: `src/core/batch.test.ts` (append)

**Interfaces:**
- Consumes: `EPSILON`, `rawRemainingG`, `portionWeightG`, `portionsRemaining` from Task 1; `flagYield`, `observedFactor`, `referenceFactor`, `yieldBounds` from Task 2; `formatG` from `src/core/units.ts`
- Produces: `type Validation`, `interface CookDraft`, `validateCook`, `portionsToGrams`, `validateEat`, `applyEat`

- [ ] **Step 1: Write the failing test**

Append to `src/core/batch.test.ts`. Merge these imports into the existing
import block at the top of the file rather than adding a second one:

```ts
import {
  applyEat, portionsToGrams, validateCook, validateEat, type CookDraft,
} from './batch';
import type { Ingredient } from './types';
import { INGREDIENTS } from '../data/ingredients';
import { CATEGORY_YIELD } from '../data/categoryYield';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const cookDraft = (over: Partial<CookDraft> = {}): CookDraft => ({
  method: 'roasted',
  rawUsedG: g(400),
  cookedWeightG: g(284),   // chicken-breast publishes roasted at 0.71
  portionCount: 2,
  cookedAt: '2026-09-19',
  ...over,
});

const chicken = () => bundled('chicken-breast');

describe('validateCook', () => {
  it('accepts a cook that fits inside the remaining raw weight', () => {
    expect(validateCook(batch(), [], cookDraft(), chicken(), CATEGORY_YIELD)).toEqual({ ok: true });
  });

  it('accepts cooking the entire remainder, which is the common case', () => {
    const draft = cookDraft({ rawUsedG: g(1000), cookedWeightG: g(710) });
    expect(validateCook(batch(), [], draft, chicken(), CATEGORY_YIELD)).toEqual({ ok: true });
  });

  it('blocks cooking more than is left, and says how much that is', () => {
    const sessions = [session({ rawUsedG: g(800) })];
    const result = validateCook(batch(), sessions, cookDraft({ rawUsedG: g(400) }), chicken(), CATEGORY_YIELD);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('200g');
  });

  it('blocks a raw weight of zero', () => {
    expect(validateCook(batch(), [], cookDraft({ rawUsedG: g(0) }), chicken(), CATEGORY_YIELD).ok).toBe(false);
  });

  it('blocks a cooked weight of zero', () => {
    expect(validateCook(batch(), [], cookDraft({ cookedWeightG: g(0) }), chicken(), CATEGORY_YIELD).ok).toBe(false);
  });

  it('blocks a portion count below one', () => {
    const result = validateCook(batch(), [], cookDraft({ portionCount: 0 }), chicken(), CATEGORY_YIELD);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('portion');
  });

  it('blocks a fractional portion count', () => {
    expect(validateCook(batch(), [], cookDraft({ portionCount: 2.5 }), chicken(), CATEGORY_YIELD).ok).toBe(false);
  });

  it('blocks a transposed digit, naming the typical yield', () => {
    const draft = cookDraft({ rawUsedG: g(400), cookedWeightG: g(4000) });
    const result = validateCook(batch({ rawWeightG: g(5000) }), [], draft, chicken(), CATEGORY_YIELD);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('71%');
  });

  it('accepts boiled cabbage gaining weight, though absorbsWater is false', () => {
    const draft = cookDraft({ method: 'boiled', rawUsedG: g(500), cookedWeightG: g(535) });
    expect(validateCook(batch(), [], draft, bundled('cabbage'), CATEGORY_YIELD)).toEqual({ ok: true });
  });

  it('accepts boiled rolled oats multiplying more than sixfold', () => {
    const draft = cookDraft({ method: 'boiled', rawUsedG: g(100), cookedWeightG: g(665) });
    expect(validateCook(batch(), [], draft, bundled('rolled-oats'), CATEGORY_YIELD)).toEqual({ ok: true });
  });

  it('accepts a cook that flagYield will flag, leaving the warning to the form', () => {
    // 0.45 against a 0.71 reference: 37% off, so flagYield reports a deviation,
    // but it is inside the x3 bounds. The guard must not block it, or a
    // slow-roasted tray becomes unloggable.
    const draft = cookDraft({ rawUsedG: g(400), cookedWeightG: g(180) });
    expect(validateCook(batch(), [], draft, chicken(), CATEGORY_YIELD)).toEqual({ ok: true });
  });
});

describe('portionsToGrams', () => {
  it('converts a portion count into the grams it stands for', () => {
    expect(portionsToGrams(session({ cookedWeightG: g(296), portionCount: 2 }), 1)).toBe(148);
  });
});

describe('validateEat', () => {
  it('accepts eating less than what is left', () => {
    expect(validateEat(session({ cookedRemainingG: g(300) }), g(100))).toEqual({ ok: true });
  });

  it('accepts eating exactly what is left', () => {
    expect(validateEat(session({ cookedRemainingG: g(300) }), g(300))).toEqual({ ok: true });
  });

  it('blocks eating more than is left, reporting grams and portions', () => {
    const s = session({ cookedWeightG: g(296), portionCount: 2, cookedRemainingG: g(148) });
    const result = validateEat(s, g(200));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('148g');
    expect(result.ok === false && result.message).toContain('1.0');
  });

  it('blocks eating nothing', () => {
    expect(validateEat(session(), g(0)).ok).toBe(false);
  });
});

describe('applyEat', () => {
  it('subtracts the eaten grams from what remains', () => {
    expect(applyEat(session({ cookedRemainingG: g(300) }), g(100)).cookedRemainingG).toBe(200);
  });

  it('leaves the original session untouched', () => {
    const before = session({ cookedRemainingG: g(300) });
    applyEat(before, g(100));
    expect(before.cookedRemainingG).toBe(300);
  });

  it('never leaves a negative remainder even when floats disagree', () => {
    expect(applyEat(session({ cookedRemainingG: g(148) }), g(148.0000001)).cookedRemainingG).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/core/batch.test.ts
```

Expected: FAIL — `validateCook` is not exported from `./batch`.

- [ ] **Step 3: Write the implementation**

Replace the import lines at the top of `src/core/batch.ts` with:

```ts
import { flagYield } from './calibration';
import type { Batch, CookMethod, CookSession, Ingredient, IsoDate } from './types';
import { formatG, g, type Grams } from './units';
import type { CategoryYield } from './yieldResolver';
```

Then append:

```ts
export type Validation = { ok: true } | { ok: false; message: string };

const ok: Validation = { ok: true };
const no = (message: string): Validation => ({ ok: false, message });

export interface CookDraft {
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
  portionCount: number;
  cookedAt: IsoDate;
}

/**
 * Guards a cook before it is written. Every rejection names the real quantity,
 * because "invalid weight" tells the user nothing they can act on.
 *
 * The weight relationship is checked against the ingredient and method's
 * reference factor, not against a cooked-must-be-lighter-than-raw rule: boiled
 * greens and every grain legitimately gain mass. Only the impossible band is
 * blocked here; an unusual-but-possible cook is saved and left to `flagYield`
 * to mention, because the user's kitchen is allowed to differ from USDA's.
 */
export function validateCook(
  batch: Batch,
  sessions: readonly CookSession[],
  draft: CookDraft,
  ingredient: Ingredient,
  categoryYield: CategoryYield,
): Validation {
  if (draft.rawUsedG <= 0) return no(`Enter how much raw ${ingredient.name.toLowerCase()} you cooked.`);

  const remaining = rawRemainingG(batch, sessions);
  if (draft.rawUsedG > remaining + EPSILON) {
    return no(`Only ${formatG(remaining)} of this batch is still uncooked.`);
  }

  if (draft.cookedWeightG <= 0) return no('Weigh the cooked food and enter it.');

  if (!Number.isInteger(draft.portionCount) || draft.portionCount < 1) {
    return no('Split the cooked food into a whole number of portions, at least one.');
  }

  const flag = flagYield(draft, ingredient, categoryYield);
  if (flag?.kind === 'implausible') return no(flag.reason);

  return ok;
}

/** Portions are a view over grams, so the UI converts before validating. */
export const portionsToGrams = (session: CookSession, portions: number): Grams =>
  g(portionWeightG(session) * portions);

export function validateEat(session: CookSession, grams: Grams): Validation {
  if (grams <= 0) return no('Enter how much you ate.');

  if (grams > session.cookedRemainingG + EPSILON) {
    const portions = portionsRemaining(session);
    return no(`Only ${formatG(session.cookedRemainingG)} is left — about ${portions.toFixed(1)} portions.`);
  }

  return ok;
}

/** Returns a new session; callers persist it. Validate first. */
export function applyEat(session: CookSession, grams: Grams): CookSession {
  return { ...session, cookedRemainingG: g(Math.max(0, session.cookedRemainingG - grams)) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/core/batch.test.ts
```

Expected: PASS, 31 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/batch.ts src/core/batch.test.ts
git commit -m "feat: add the cook and eat guards

Both report the real remaining quantity rather than a bare rejection. The
weight check blocks only the impossible band from calibration, leaving unusual
cooks to be saved and merely flagged: pinned regressions accept boiled cabbage
gaining mass and boiled rolled oats multiplying sixfold, while a 10x typo is
still refused."
```

---

## Task 4: Correction arithmetic

**Files:**
- Modify: `src/core/batch.ts` (append)
- Test: `src/core/batch.test.ts` (append)

**Interfaces:**
- Consumes: `EPSILON`, `sessionsOf`, `Validation`, `no`/`ok` helpers from Tasks 1 and 3
- Produces: `cookedRawTotalG`, `validateRawWeightEdit`, `validateRawUsedEdit`, `rescaleCookedRemaining`

- [ ] **Step 1: Write the failing test**

Append to `src/core/batch.test.ts`:

```ts
import {
  cookedRawTotalG, rescaleCookedRemaining, validateRawUsedEdit, validateRawWeightEdit,
} from './batch';

describe('cookedRawTotalG', () => {
  it('sums the raw weight every session of this batch consumed', () => {
    const sessions = [
      session({ id: 's1', rawUsedG: g(400) }),
      session({ id: 's2', rawUsedG: g(250) }),
      session({ id: 's3', batchId: 'b2', rawUsedG: g(900) }),
    ];
    expect(cookedRawTotalG(batch(), sessions)).toBe(650);
  });
});

describe('validateRawWeightEdit', () => {
  it('accepts a correction that still covers what has been cooked', () => {
    const sessions = [session({ rawUsedG: g(400) })];
    expect(validateRawWeightEdit(batch(), sessions, g(800))).toEqual({ ok: true });
  });

  it('accepts a correction down to exactly what has been cooked', () => {
    const sessions = [session({ rawUsedG: g(400) })];
    expect(validateRawWeightEdit(batch(), sessions, g(400))).toEqual({ ok: true });
  });

  it('blocks a correction below what has been cooked, naming that total', () => {
    // Clamping instead would leave a batch claiming more food came out of it
    // than went into it, which no later screen could interpret.
    const sessions = [session({ rawUsedG: g(400) })];
    const result = validateRawWeightEdit(batch(), sessions, g(300));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('400g');
  });

  it('blocks a correction to zero', () => {
    expect(validateRawWeightEdit(batch(), [], g(0)).ok).toBe(false);
  });
});

describe('validateRawUsedEdit', () => {
  it('accepts a change that fits the remainder excluding this session', () => {
    const sessions = [session({ id: 's1', rawUsedG: g(400) }), session({ id: 's2', rawUsedG: g(300) })];
    // 1000 total, 300 used by the other session, so s1 may grow to 700.
    expect(validateRawUsedEdit(batch(), sessions, 's1', g(700))).toEqual({ ok: true });
  });

  it('blocks a change that would overdraw the batch', () => {
    const sessions = [session({ id: 's1', rawUsedG: g(400) }), session({ id: 's2', rawUsedG: g(300) })];
    const result = validateRawUsedEdit(batch(), sessions, 's1', g(701));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('700g');
  });

  it('blocks a change to zero', () => {
    expect(validateRawUsedEdit(batch(), [session()], 's1', g(0)).ok).toBe(false);
  });
});

describe('rescaleCookedRemaining', () => {
  it('preserves the fraction eaten rather than the grams eaten', () => {
    // 80g logged for what was really 800g, half eaten. Correcting the weight
    // should leave it half remaining, not 40g remaining out of 800g.
    const s = session({ cookedWeightG: g(80), cookedRemainingG: g(40) });
    expect(rescaleCookedRemaining(s, g(800))).toBe(400);
  });

  it('keeps an untouched session whole', () => {
    const s = session({ cookedWeightG: g(300), cookedRemainingG: g(300) });
    expect(rescaleCookedRemaining(s, g(750))).toBe(750);
  });

  it('keeps a finished session finished', () => {
    const s = session({ cookedWeightG: g(300), cookedRemainingG: g(0) });
    expect(rescaleCookedRemaining(s, g(750))).toBe(0);
  });

  it('never exceeds the corrected cooked weight', () => {
    const s = session({ cookedWeightG: g(300), cookedRemainingG: g(300) });
    expect(rescaleCookedRemaining(s, g(100))).toBe(100);
  });

  it('treats a session that recorded no cooked weight as wholly remaining', () => {
    const s = session({ cookedWeightG: g(0), cookedRemainingG: g(0) });
    expect(rescaleCookedRemaining(s, g(500))).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/core/batch.test.ts
```

Expected: FAIL — `cookedRawTotalG` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/core/batch.ts`:

```ts
export const cookedRawTotalG = (batch: Batch, sessions: readonly CookSession[]): Grams =>
  g(sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0));

/**
 * A purchase weight may be corrected downwards only as far as what has already
 * been cooked out of it.
 */
export function validateRawWeightEdit(
  batch: Batch,
  sessions: readonly CookSession[],
  newRawWeightG: Grams,
): Validation {
  if (newRawWeightG <= 0) return no('A batch has to weigh something.');

  const cooked = cookedRawTotalG(batch, sessions);
  if (newRawWeightG < cooked - EPSILON) {
    return no(
      `${formatG(cooked)} of this batch has already been cooked, so it cannot ` +
      `have weighed less than that.`,
    );
  }

  return ok;
}

/** A session's raw weight may grow into whatever the *other* sessions left. */
export function validateRawUsedEdit(
  batch: Batch,
  sessions: readonly CookSession[],
  sessionId: string,
  newRawUsedG: Grams,
): Validation {
  if (newRawUsedG <= 0) return no('A cook has to use some of the batch.');

  const others = sessionsOf(batch.id, sessions)
    .filter((s) => s.id !== sessionId)
    .reduce((sum, s) => sum + s.rawUsedG, 0);
  const available = g(Math.max(0, batch.rawWeightG - others));

  if (newRawUsedG > available + EPSILON) {
    return no(`Only ${formatG(available)} of this batch is available for this cook.`);
  }

  return ok;
}

/**
 * Rescales what is left after a cooked weight is corrected, preserving the
 * FRACTION eaten rather than the grams eaten — the grams were always a reading
 * of the same food, so weighing 800g as 80g and fixing it later should leave a
 * half-eaten batch still half remaining.
 */
export function rescaleCookedRemaining(session: CookSession, newCookedWeightG: Grams): Grams {
  // Nothing was eaten out of a session that never recorded a weight, so the
  // corrected weight is entirely remaining.
  if (session.cookedWeightG <= 0) return newCookedWeightG;

  const fractionLeft = session.cookedRemainingG / session.cookedWeightG;
  return g(Math.min(newCookedWeightG, Math.max(0, newCookedWeightG * fractionLeft)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/core/batch.test.ts
```

Expected: PASS, 44 tests.

- [ ] **Step 5: Run the whole suite and the type build**

```bash
npx vitest run && npx tsc -b
```

Expected: 285 baseline + the new core tests pass; `tsc` silent.

- [ ] **Step 6: Commit**

```bash
git add src/core/batch.ts src/core/batch.test.ts
git commit -m "feat: add correction arithmetic for edited batches and sessions

A corrected cooked weight preserves the fraction eaten, not the grams eaten,
so fixing a mistyped 80g to 800g leaves a half-eaten batch half remaining.
Shrinking a purchase below what has already been cooked out of it is blocked
rather than clamped: clamping would leave a batch claiming more came out than
went in."
```

---

## Task 5: Cost

**Files:**
- Create: `src/core/cost.ts`
- Test: `src/core/cost.test.ts`

**Interfaces:**
- Consumes: `Batch`, `CookSession`, `Ingredient` from `src/core/types.ts`; `MYR`, `myr`, `Grams` from `src/core/units.ts`; `sessionsOf` from `src/core/batch.ts`; `retentionFor`, `RetentionLookup` from `src/core/retention.ts`
- Produces: `costPerKgRaw`, `attributablePriceMYR`, `costPerKgCooked`, `costPerPortion`, `proteinPerMYRRaw`, `proteinPerMYRRetained`

Every function returns `null` for "not computable yet" — no sessions, a zero
weight, a zero price — and the UI renders an em dash. A single convention keeps
the callers from each inventing a different fallback.

- [ ] **Step 1: Write the failing test**

Create `src/core/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Batch, CookSession, Ingredient } from './types';
import { g, myr } from './units';
import { zeroNutrients } from './nutrients';
import { RETENTION } from '../data/retentionTable';
import {
  attributablePriceMYR, costPerKgCooked, costPerKgRaw, costPerPortion,
  proteinPerMYRRaw, proteinPerMYRRetained,
} from './cost';

const chicken: Ingredient = {
  id: 'chicken-breast', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 23 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false,
  source: 'usda', archived: false,
};

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0, ...over,
});

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

describe('costPerKgRaw', () => {
  it('divides the price paid by the purchase weight', () => {
    expect(costPerKgRaw(batch())).toBe(20);
  });

  it('handles a part-kilo purchase', () => {
    expect(costPerKgRaw(batch({ rawWeightG: g(500) }))).toBe(40);
  });

  it('is null for a weightless batch rather than Infinity', () => {
    expect(costPerKgRaw(batch({ rawWeightG: g(0) }))).toBeNull();
  });
});

describe('attributablePriceMYR', () => {
  it('apportions the price by the share of the batch cooked', () => {
    // 400g of a 1000g batch bought for RM20.
    expect(attributablePriceMYR(batch(), [session({ rawUsedG: g(400) })])).toBeCloseTo(8, 10);
  });

  it('attributes the whole price once the batch is fully cooked', () => {
    const sessions = [session({ id: 's1', rawUsedG: g(600) }), session({ id: 's2', rawUsedG: g(400) })];
    expect(attributablePriceMYR(batch(), sessions)).toBeCloseTo(20, 10);
  });

  it('ignores sessions belonging to another batch', () => {
    const sessions = [session({ id: 's1', rawUsedG: g(400) }), session({ id: 's2', batchId: 'b2', rawUsedG: g(400) })];
    expect(attributablePriceMYR(batch(), sessions)).toBeCloseTo(8, 10);
  });

  it('is null for a weightless batch', () => {
    expect(attributablePriceMYR(batch({ rawWeightG: g(0) }), [session()])).toBeNull();
  });
});

describe('costPerKgCooked', () => {
  it('charges the apportioned price against the cooked weight produced', () => {
    // RM8 attributable, 284g cooked -> RM28.17/kg.
    expect(costPerKgCooked(batch(), [session()])!).toBeCloseTo(28.169, 3);
  });

  it('is null before anything has been cooked', () => {
    expect(costPerKgCooked(batch(), [])).toBeNull();
  });
});

describe('costPerPortion', () => {
  it('splits the session share of the price across its portions', () => {
    // RM8 for this cook, 2 portions.
    expect(costPerPortion(batch(), session())!).toBeCloseTo(4, 10);
  });

  it('is null when the portion count is not usable', () => {
    expect(costPerPortion(batch(), session({ portionCount: 0 }))).toBeNull();
  });
});

describe('proteinPerMYRRaw', () => {
  it('is the grams of protein bought per ringgit', () => {
    // 1000g at 23g/100g = 230g protein for RM20.
    expect(proteinPerMYRRaw(batch(), chicken)!).toBeCloseTo(11.5, 10);
  });

  it('is null for a gift, where price per gram is undefined', () => {
    expect(proteinPerMYRRaw(batch({ purchase: { ...batch().purchase, pricePaidMYR: myr(0) } }), chicken)).toBeNull();
  });
});

describe('proteinPerMYRRetained', () => {
  it('charges the apportioned price against the protein that survived cooking', () => {
    // 400g raw -> 92g protein; meat/roasted protein retention is applied; RM8.
    const value = proteinPerMYRRetained(batch(), chicken, [session()], RETENTION)!;
    expect(value).toBeGreaterThan(10);
    expect(value).toBeLessThan(11.5);
  });

  it('is null before anything has been cooked', () => {
    expect(proteinPerMYRRetained(batch(), chicken, [], RETENTION)).toBeNull();
  });

  it('is null for a gift', () => {
    const free = batch({ purchase: { ...batch().purchase, pricePaidMYR: myr(0) } });
    expect(proteinPerMYRRetained(free, chicken, [session()], RETENTION)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/core/cost.test.ts
```

Expected: FAIL — `Failed to resolve import "./cost"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/cost.ts`:

```ts
import { sessionsOf } from './batch';
import { retentionFor, type RetentionLookup } from './retention';
import type { Batch, CookSession, Ingredient } from './types';
import { myr, type MYR } from './units';

/**
 * Every figure here returns null for "not computable yet" — no cooks logged, a
 * weightless batch, a price of zero — and the UI renders an em dash. One
 * convention, so no caller has to invent its own fallback.
 */

const PER_KG = 1000;

export function costPerKgRaw(batch: Batch): MYR | null {
  if (batch.rawWeightG <= 0) return null;
  return myr(batch.purchase.pricePaidMYR / (batch.rawWeightG / PER_KG));
}

/**
 * The share of a purchase price that belongs to what has actually been cooked.
 * A batch cooked in three sittings has to divide its price somehow, and raw
 * weight is the only basis that does not depend on how well each cook went.
 */
export function attributablePriceMYR(batch: Batch, sessions: readonly CookSession[]): MYR | null {
  if (batch.rawWeightG <= 0) return null;
  const rawUsed = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0);
  return myr(batch.purchase.pricePaidMYR * (rawUsed / batch.rawWeightG));
}

export function costPerKgCooked(batch: Batch, sessions: readonly CookSession[]): MYR | null {
  const price = attributablePriceMYR(batch, sessions);
  if (price === null) return null;
  const cooked = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.cookedWeightG, 0);
  if (cooked <= 0) return null;
  return myr(price / (cooked / PER_KG));
}

export function costPerPortion(batch: Batch, session: CookSession): MYR | null {
  if (batch.rawWeightG <= 0 || session.portionCount < 1) return null;
  const sessionPrice = batch.purchase.pricePaidMYR * (session.rawUsedG / batch.rawWeightG);
  return myr(sessionPrice / session.portionCount);
}

/**
 * The headline buying number: grams of protein per ringgit, known the moment
 * the purchase is entered, before anything is cooked.
 */
export function proteinPerMYRRaw(batch: Batch, ingredient: Ingredient): number | null {
  if (batch.purchase.pricePaidMYR <= 0) return null;
  const proteinG = (batch.rawWeightG / 100) * ingredient.per100gRaw.protein;
  return proteinG / batch.purchase.pricePaidMYR;
}

/**
 * The same figure after leaching, for the protein that actually reached the
 * plate.
 *
 * Note what this does NOT do: it never multiplies by a yield factor. Cooking
 * moves water, not protein — the measured `cookedWeightG` changes the
 * concentration, not the mass. Only retention removes protein, so only
 * retention is applied, and the user's own measured weights are respected
 * rather than re-derived.
 */
export function proteinPerMYRRetained(
  batch: Batch,
  ingredient: Ingredient,
  sessions: readonly CookSession[],
  retention: RetentionLookup,
): number | null {
  const price = attributablePriceMYR(batch, sessions);
  if (price === null || price <= 0) return null;

  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return null;

  const proteinG = mine.reduce((sum, s) => {
    const raw = (s.rawUsedG / 100) * ingredient.per100gRaw.protein;
    return sum + raw * retentionFor(retention, ingredient.category, s.method, 'protein').factor;
  }, 0);

  return proteinG / price;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/core/cost.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/cost.ts src/core/cost.test.ts
git commit -m "feat: add per-batch cost arithmetic

Partially cooked batches apportion their price by raw weight used, which is the
only basis independent of how well each cook went. Retained protein per ringgit
applies retention only, never a yield factor: cooking moves water, not protein,
so the user's measured cooked weight is respected rather than re-derived."
```

---

## Task 6: Schema version 2, and the blocked-upgrade fix

**Files:**
- Modify: `src/storage/db.ts`
- Test: `src/storage/storage.test.ts` (append one test)
- Test: `src/storage/migration.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `SCHEMA_V1`, `SCHEMA_V2`, `STORAGE_PROBE_TIMEOUT_MS`, `db.batches`, `db.cookSessions`, `isStorageAvailable(timeoutMs?)`

The Phase 1 execution record logged a defect explicitly against this phase: a
blocked upgrade — a second tab holding version 1 open while version 2 loads —
does not reject Dexie's open promise, so `isStorageAvailable()` can hang
pending rather than resolving `false`, and the launch banner never appears. It
could not arise while only one schema version existed. Version 2 makes it
reachable, so it is fixed here rather than left to be discovered in the field.

- [ ] **Step 1: Write the failing migration test**

Create `src/storage/migration.test.ts`. It builds throwaway Dexie instances
from the schema constants `db.ts` itself uses, so the test cannot drift out of
agreement with the real schema:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { SCHEMA_V1, SCHEMA_V2 } from './db';
import { zeroNutrients } from '../core/nutrients';
import type { Ingredient, Profile } from '../core/types';

const NAME = 'ingcalc-migration-test';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

const custom: Ingredient = {
  id: 'u1', name: 'Petai', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 140, protein: 6 },
  publishedYield: {}, absorbsWater: false, source: 'user', archived: false,
};

afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('schema upgrade v1 to v2', () => {
  it('keeps Phase 1 data and adds the two new tables', async () => {
    await Dexie.delete(NAME);

    const v1 = new Dexie(NAME);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('profiles').put(profile);
    await v1.table('userIngredients').put(custom);
    v1.close();

    const v2 = new Dexie(NAME);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();

    expect(v2.verno).toBe(2);
    // Data is never dropped: the parent spec promises a versioned migration.
    expect(await v2.table('profiles').toArray()).toEqual([profile]);
    expect(await v2.table('userIngredients').toArray()).toEqual([custom]);
    expect(await v2.table('batches').toArray()).toEqual([]);
    expect(await v2.table('cookSessions').toArray()).toEqual([]);
    v2.close();
  });

  it('opens straight at version 2 on a fresh install', async () => {
    await Dexie.delete(NAME);

    const fresh = new Dexie(NAME);
    fresh.version(1).stores(SCHEMA_V1);
    fresh.version(2).stores(SCHEMA_V2);
    await fresh.open();

    expect(fresh.verno).toBe(2);
    expect(fresh.tables.map((t) => t.name).sort()).toEqual(
      ['batches', 'cookSessions', 'profiles', 'settings', 'userIngredients'],
    );
    fresh.close();
  });
});
```

- [ ] **Step 2: Write the failing probe test**

Append to `src/storage/storage.test.ts`:

```ts
it('resolves false rather than hanging when the database never responds', async () => {
  // The Phase 1 defect: a blocked upgrade leaves Dexie's open promise pending
  // forever, so the launch banner never renders and the user is never told
  // their entries are being discarded.
  const openSpy = vi.spyOn(db, 'open').mockReturnValue(
    new Promise(() => { /* never settles */ }) as ReturnType<typeof db.open>,
  );
  try {
    expect(await isStorageAvailable(20)).toBe(false);
  } finally {
    openSpy.mockRestore();
  }
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/storage/
```

Expected: FAIL — `SCHEMA_V1` is not exported, and `isStorageAvailable` takes no
argument.

- [ ] **Step 4: Write the implementation**

Replace the whole of `src/storage/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';
import type { Batch, CookSession, Ingredient, Profile } from '../core/types';

export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: 'today' | 'calc';
  defaultWeightUnit: 'g' | 'kg';
}

/**
 * Exported so `migration.test.ts` can build throwaway databases from the same
 * declarations the app uses, rather than a copy that can drift out of step.
 */
export const SCHEMA_V1: Record<string, string> = {
  profiles: 'id',
  userIngredients: 'id, category, archived',
  settings: 'id',
};

/**
 * Dexie's `stores()` is a delta on the previous version, so only the new tables
 * are declared. Version 1's three tables are untouched, which is why no
 * migration function is needed and no existing row is rewritten.
 *
 * `cookSessions` is indexed by `batchId` for the cascading delete. It is
 * deliberately NOT indexed by ingredient: a session knows only its batch, and
 * calibration joins through `batches` rather than denormalising the ingredient
 * onto every session. See the addendum, §4.
 */
export const SCHEMA_V2: Record<string, string> = {
  batches: 'id, ingredientId, createdAt',
  cookSessions: 'id, batchId, cookedAt',
};

export class IngCalcDB extends Dexie {
  profiles!: Table<Profile, string>;
  userIngredients!: Table<Ingredient, string>;
  settings!: Table<Settings, string>;
  batches!: Table<Batch, string>;
  cookSessions!: Table<CookSession, string>;

  constructor() {
    super('ingcalc');
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2);
  }
}

export const db = new IngCalcDB();

export const STORAGE_PROBE_TIMEOUT_MS = 3000;

/**
 * Private browsing can make IndexedDB unavailable. The app must say so at
 * launch rather than silently discarding everything the user enters.
 *
 * Two failure modes beyond a plain rejection, both introduced by having more
 * than one schema version:
 *
 *  - Another tab holding version 1 open blocks the upgrade to version 2. Dexie
 *    fires `blocked` but never rejects `open()`, so without this the probe
 *    hangs pending and the banner never appears.
 *  - Anything else that leaves the open pending indefinitely is caught by the
 *    timeout, which is the backstop rather than the primary signal.
 *
 * `timeoutMs` is injectable so the hang can be tested in milliseconds.
 */
export async function isStorageAvailable(
  timeoutMs: number = STORAGE_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onBlocked: (() => void) | undefined;

  try {
    const probe = (async () => {
      await db.open();
      await db.settings.limit(1).toArray();
    })();

    const blocked = new Promise<never>((_, reject) => {
      onBlocked = () => reject(new Error('A schema upgrade is blocked by another open tab'));
      db.on('blocked', onBlocked);
    });

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Storage did not respond')), timeoutMs);
    });

    await Promise.race([probe, blocked, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Leaving handlers attached would accumulate one per probe.
    if (onBlocked !== undefined) db.on('blocked').unsubscribe(onBlocked);
  }
}
```

- [ ] **Step 5: Run the storage tests to verify they pass**

```bash
npx vitest run src/storage/
```

Expected: PASS — the 8 existing storage tests, the new probe test, and 2
migration tests.

- [ ] **Step 6: Confirm the whole suite still passes**

```bash
npx vitest run && npx tsc -b
```

Expected: everything green. Pay attention to `src/ui/App.test.tsx`, which
mocks storage — the new `isStorageAvailable` parameter is optional, so it must
keep working unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/storage/db.ts src/storage/storage.test.ts src/storage/migration.test.ts
git commit -m "feat: add schema version 2 for batches and cook sessions

Dexie's stores() is a delta, so only the two new tables are declared and no
Phase 1 row is rewritten; a migration test pins that by writing through v1 and
reading back through v2.

Also fixes the defect Phase 1 logged against this phase: a blocked upgrade
never rejects Dexie's open promise, so isStorageAvailable() could hang pending
and the launch banner would never warn the user their entries were being
discarded. Now races the open against the blocked event and a timeout."
```

---

## Task 7: The kitchen storage layer

**Files:**
- Create: `src/storage/kitchen.ts`
- Test: `src/storage/kitchen.test.ts`

**Interfaces:**
- Consumes: `db` from `src/storage/db.ts`; `Batch`, `CookSession` from `src/core/types.ts`
- Produces: `listBatches`, `listCookSessions`, `loadKitchen`, `saveBatch`, `saveCookSession`, `deleteCookSession`, `deleteBatchCascade`

This layer reads and writes rows and does nothing else. No rules, no
arithmetic, no derivation — those live in `src/core/` where they are testable
without a database.

- [ ] **Step 1: Write the failing test**

Create `src/storage/kitchen.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import {
  deleteBatchCascade, deleteCookSession, listBatches, listCookSessions,
  loadKitchen, saveBatch, saveCookSession,
} from './kitchen';
import { g, myr } from '../core/units';
import type { Batch, CookSession } from '../core/types';

const batch = (id: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 1_758_240_000_000, ...over,
});

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
});

describe('kitchen storage', () => {
  it('round-trips a batch, nested purchase included', async () => {
    await saveBatch(batch('b1'));
    expect(await listBatches()).toEqual([batch('b1')]);
  });

  it('updates a batch in place rather than duplicating it', async () => {
    await saveBatch(batch('b1'));
    await saveBatch(batch('b1', { rawWeightG: g(900) }));
    const all = await listBatches();
    expect(all.length).toBe(1);
    expect(all[0]!.rawWeightG).toBe(900);
  });

  it('round-trips a cook session', async () => {
    await saveCookSession(session('s1', 'b1'));
    expect(await listCookSessions()).toEqual([session('s1', 'b1')]);
  });

  it('deletes a single session without touching its batch', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));
    await deleteCookSession('s1');
    expect(await listCookSessions()).toEqual([]);
    expect((await listBatches()).length).toBe(1);
  });

  it('loads both tables together', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));
    const { batches, sessions } = await loadKitchen();
    expect(batches.length).toBe(1);
    expect(sessions.length).toBe(1);
  });

  it('takes a batch sessions with it when the batch is deleted', async () => {
    // An orphaned session would be silently dropped by toYieldSamples, so the
    // cook would vanish from calibration without ever being deleted.
    await saveBatch(batch('b1'));
    await saveBatch(batch('b2'));
    await saveCookSession(session('s1', 'b1'));
    await saveCookSession(session('s2', 'b1'));
    await saveCookSession(session('s3', 'b2'));

    await deleteBatchCascade('b1');

    expect((await listBatches()).map((b) => b.id)).toEqual(['b2']);
    expect((await listCookSessions()).map((s) => s.id)).toEqual(['s3']);
  });

  it('deletes a batch that has no sessions', async () => {
    await saveBatch(batch('b1'));
    await deleteBatchCascade('b1');
    expect(await listBatches()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/storage/kitchen.test.ts
```

Expected: FAIL — `Failed to resolve import "./kitchen"`.

- [ ] **Step 3: Write the implementation**

Create `src/storage/kitchen.ts`:

```ts
import { db } from './db';
import type { Batch, CookSession } from '../core/types';

export const listBatches = (): Promise<Batch[]> => db.batches.toArray();
export const listCookSessions = (): Promise<CookSession[]> => db.cookSessions.toArray();

/**
 * Both tables in one call, because every derived quantity in `core/batch.ts`
 * needs a batch and its sessions together, and calibration needs all of both.
 */
export const loadKitchen = async (): Promise<{ batches: Batch[]; sessions: CookSession[] }> => {
  const [batches, sessions] = await Promise.all([listBatches(), listCookSessions()]);
  return { batches, sessions };
};

export const saveBatch = async (b: Batch): Promise<void> => { await db.batches.put(b); };
export const saveCookSession = async (s: CookSession): Promise<void> => { await db.cookSessions.put(s); };
export const deleteCookSession = async (id: string): Promise<void> => { await db.cookSessions.delete(id); };

/**
 * Deleting a batch must take its sessions with it. A surviving session would
 * be an orphan, which `toYieldSamples` silently skips — so the cook would
 * disappear from calibration while still occupying a row.
 *
 * One transaction, so a failure cannot leave half of it done.
 */
export const deleteBatchCascade = async (batchId: string): Promise<void> => {
  await db.transaction('rw', db.batches, db.cookSessions, async () => {
    await db.cookSessions.where('batchId').equals(batchId).delete();
    await db.batches.delete(batchId);
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/storage/kitchen.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/kitchen.ts src/storage/kitchen.test.ts
git commit -m "feat: add batch and cook session storage with cascading delete

Deleting a batch removes its sessions in one transaction: a surviving orphan
would be skipped by toYieldSamples, disappearing from calibration while still
occupying a row."
```

---

## Task 8: The `useKitchen` hook

**Files:**
- Create: `src/ui/useKitchen.ts`
- Test: `src/ui/useKitchen.test.ts`

**Interfaces:**
- Consumes: `loadKitchen` from `src/storage/kitchen.ts`; `toYieldSamples` from `src/core/calibration.ts`
- Produces: `interface Kitchen`, `useKitchen()`

Mutations are not in the hook. Screens call the storage functions directly and
then `refresh()`, which is the pattern Phase 1 established between
`AddIngredientScreen` and `useCatalogue` — one fewer layer to keep in step.

- [ ] **Step 1: Write the failing test**

Create `src/ui/useKitchen.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useKitchen } from './useKitchen';
import { db } from '../storage/db';
import { saveBatch, saveCookSession } from '../storage/kitchen';
import * as kitchenModule from '../storage/kitchen';
import { g, myr } from '../core/units';
import type { Batch, CookSession } from '../core/types';

const batch = (id: string): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0,
});

const session = (id: string, batchId: string): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
});

describe('useKitchen', () => {
  it('loads batches and sessions on mount', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));

    const { result } = renderHook(() => useKitchen());
    expect(result.current.loading).toBe(true);
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.batches.map((b) => b.id)).toEqual(['b1']);
    expect(result.current.sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('derives yield samples with the ingredient joined on', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));

    const { result } = renderHook(() => useKitchen());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.samples).toEqual([{
      ingredientId: 'chicken-breast', method: 'roasted',
      rawUsedG: 400, cookedWeightG: 284, excludeFromCalibration: false,
    }]);
  });

  it('refresh picks up a batch written after mount', async () => {
    const { result } = renderHook(() => useKitchen());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.batches).toEqual([]);

    await saveBatch(batch('b1'));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.batches.map((b) => b.id)).toEqual(['b1']);
  });

  it('reports a storage failure instead of showing an empty kitchen', async () => {
    // An empty list and an unreadable database look identical on screen, and
    // "you have no batches" is a lie that invites entering them all again.
    const spy = vi.spyOn(kitchenModule, 'loadKitchen').mockRejectedValue(new Error('nope'));
    try {
      const { result } = renderHook(() => useKitchen());
      await waitFor(() => { expect(result.current.loading).toBe(false); });
      expect(result.current.storageError).not.toBeNull();
      expect(result.current.batches).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/useKitchen.test.ts
```

Expected: FAIL — `Failed to resolve import "./useKitchen"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/useKitchen.ts`. The generation guard is the same one
`useCatalogue` uses, and for the same reason — an in-flight load must not
overwrite the result of a later one:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toYieldSamples } from '../core/calibration';
import type { Batch, CookSession, YieldSample } from '../core/types';
import { loadKitchen } from '../storage/kitchen';

export interface Kitchen {
  batches: Batch[];
  sessions: CookSession[];
  /** Fed to `resolveYield`, which is what turns published factors into measured ones. */
  samples: YieldSample[];
  loading: boolean;
  /**
   * Set when the tables could not be read. Unlike the calculator, an empty
   * kitchen and an unreadable one look identical on screen, so this must be
   * surfaced rather than swallowed.
   */
  storageError: string | null;
  refresh: () => Promise<void>;
}

export function useKitchen(): Kitchen {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sessions, setSessions] = useState<CookSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const fetchAll = useCallback(async (gen: number) => {
    try {
      const loaded = await loadKitchen();
      if (gen !== generationRef.current) return;
      setBatches(loaded.batches);
      setSessions(loaded.sessions);
      setStorageError(null);
    } catch {
      if (gen !== generationRef.current) return;
      setStorageError('Your kitchen could not be read from storage, so nothing is shown here.');
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const gen = generationRef.current;
    void fetchAll(gen);
    return () => { generationRef.current += 1; };
  }, [fetchAll]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchAll(gen);
  }, [fetchAll]);

  const samples = useMemo(() => toYieldSamples(batches, sessions), [batches, sessions]);

  return { batches, sessions, samples, loading, storageError, refresh };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/useKitchen.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useKitchen.ts src/ui/useKitchen.test.ts
git commit -m "feat: add the useKitchen hook

Reports a read failure rather than rendering an empty kitchen: an empty list and
an unreadable database look identical on screen, and 'you have no batches' is a
lie that invites entering them all again."
```

---

## Task 9: Labels, dates, and the yield badge

**Files:**
- Modify: `src/ui/labels.ts` (append)
- Create: `src/ui/dates.ts`
- Create: `src/ui/dates.test.ts`
- Create: `src/ui/components/YieldBadge.tsx`
- Create: `src/ui/components/YieldBadge.test.tsx`

**Interfaces:**
- Consumes: `BatchState` from `src/core/batch.ts`; `ResolvedYield` from `src/core/yieldResolver.ts`; `IsoDate` from `src/core/types.ts`
- Produces: `STATE_LABELS`, `yieldSentence` (in `labels.ts`); `todayIso`, `formatIsoDate` (in `dates.ts`); `YieldBadge` (component)

- [ ] **Step 1: Write the failing date test**

Create `src/ui/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatIsoDate, todayIso } from './dates';

describe('todayIso', () => {
  it('uses the local calendar date, not UTC', () => {
    // 19 Sep 2026, 00:30 local. toISOString() would report the 18th anywhere
    // east of UTC — including Malaysia, where it would be wrong for the first
    // eight hours of every day.
    expect(todayIso(new Date(2026, 8, 19, 0, 30))).toBe('2026-09-19');
  });

  it('pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatIsoDate', () => {
  it('renders a readable date', () => {
    expect(formatIsoDate('2026-09-19')).toContain('2026');
    expect(formatIsoDate('2026-09-19')).toContain('19');
  });

  it('does not shift the day across a timezone boundary', () => {
    // new Date('2026-09-19') parses as UTC midnight, which formats as the 18th
    // in any negative offset. The parts are built locally to avoid that.
    expect(formatIsoDate('2026-09-19')).not.toContain('18');
  });

  it('passes through anything that is not a date', () => {
    expect(formatIsoDate('')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/ui/dates.test.ts
```

Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 3: Write `src/ui/dates.ts`**

```ts
import type { IsoDate } from '../core/types';

/**
 * Today as a local calendar date. Deliberately not `toISOString().slice(0, 10)`,
 * which is UTC: in Malaysia that reports yesterday until 8am, so a batch bought
 * at breakfast would be filed to the wrong day.
 */
export const todayIso = (now: Date = new Date()): IsoDate => {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * The parts are parsed and rebuilt locally rather than handed to `new Date(iso)`,
 * which treats a bare 'YYYY-MM-DD' as UTC midnight and so renders the previous
 * day in any negative offset.
 */
export function formatIsoDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || Number.isNaN(year)) {
    return iso;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
```

- [ ] **Step 4: Run the date test to verify it passes**

```bash
npx vitest run src/ui/dates.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing badge test**

Create `src/ui/components/YieldBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YieldBadge } from './YieldBadge';

describe('YieldBadge', () => {
  it('names the user own cooks and the published figure they replaced', () => {
    render(<YieldBadge resolved={{ factor: 0.72, source: 'measured', sampleCount: 4 }} published={0.75} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('Your average across 4 cooks: 0.72');
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('published: 0.75');
  });

  it('says one cook rather than 1 cooks', () => {
    render(<YieldBadge resolved={{ factor: 0.7, source: 'measured', sampleCount: 1 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('1 cook:');
  });

  it('labels a published factor as published', () => {
    render(<YieldBadge resolved={{ factor: 0.75, source: 'published', sampleCount: 0 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('Published factor: 0.75');
  });

  it('calls a category fallback a rough estimate, as the spec requires', () => {
    render(<YieldBadge resolved={{ factor: 0.85, source: 'categoryDefault', sampleCount: 0 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/rough estimate/i);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run src/ui/components/YieldBadge.test.tsx
```

Expected: FAIL — `Failed to resolve import "./YieldBadge"`.

- [ ] **Step 7: Append to `src/ui/labels.ts`**

```ts
import type { BatchState } from '../core/batch';
import type { ResolvedYield } from '../core/yieldResolver';

export const STATE_LABELS: Record<BatchState, string> = {
  raw: 'Raw',
  partiallyCooked: 'Part cooked',
  cooked: 'Cooked',
  finished: 'Finished',
};

/**
 * Whose number the user is looking at, in the wording the parent spec §4 sets
 * out. The provenance matters more than the figure: the app must never show
 * precision it does not have.
 */
export function yieldSentence(resolved: ResolvedYield, published?: number): string {
  const factor = resolved.factor.toFixed(2);

  switch (resolved.source) {
    case 'measured': {
      const cooks = `${resolved.sampleCount} cook${resolved.sampleCount === 1 ? '' : 's'}`;
      const against = published === undefined ? '' : ` (published: ${published.toFixed(2)})`;
      return `Your average across ${cooks}: ${factor}${against}`;
    }
    case 'published':
      return `Published factor: ${factor}`;
    case 'categoryDefault':
      return `Category default: ${factor} — rough estimate`;
  }
}
```

Note the existing `import type { CookMethod } from '../core/types';` at the top
of the file stays; add these imports alongside it.

- [ ] **Step 8: Create `src/ui/components/YieldBadge.tsx`**

```tsx
import type { ResolvedYield } from '../../core/yieldResolver';
import { yieldSentence } from '../labels';

/** `published` is shown only to contrast with a measured factor that replaced it. */
export function YieldBadge({ resolved, published }: { resolved: ResolvedYield; published?: number }) {
  return (
    <p className={`yield-badge yield-badge--${resolved.source}`} data-testid="yield-badge">
      {yieldSentence(resolved, published)}
    </p>
  );
}
```

- [ ] **Step 9: Run both tests to verify they pass**

```bash
npx vitest run src/ui/dates.test.ts src/ui/components/YieldBadge.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 10: Commit**

```bash
git add src/ui/labels.ts src/ui/dates.ts src/ui/dates.test.ts src/ui/components/YieldBadge.tsx src/ui/components/YieldBadge.test.tsx
git commit -m "feat: add batch labels, local-date helpers and the yield badge

Dates are built from local parts rather than toISOString, which is UTC and so
files a batch bought before 8am in Malaysia to the previous day."
```

---

## Task 10: The add-and-edit batch form

**Files:**
- Create: `src/ui/components/AddBatchForm.tsx`
- Create: `src/ui/components/AddBatchForm.test.tsx`

**Interfaces:**
- Consumes: `IngredientPicker`, `WeightInput` (Phase 1 components); `validateRawWeightEdit` from `src/core/batch.ts`; `saveBatch` from `src/storage/kitchen.ts`; `todayIso` from `src/ui/dates.ts`; `newId` from `src/ui/newId.ts`; `g`, `myr` from `src/core/units.ts`
- Produces: `AddBatchForm` with props `{ catalogue, batch?, sessions?, initialIngredientId?, initialRawWeightG?, today?, onSaved, onCancel, onAddNew }`

One component creates and edits, because the fields and their validation are
identical — passing `batch` switches it to editing and prefills from that row.

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/AddBatchForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddBatchForm } from './AddBatchForm';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const catalogue: Ingredient[] = [{
  id: 'chicken-breast', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), protein: 23 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false,
  source: 'usda', archived: false,
}];

const existing: Batch = {
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-01' },
  createdAt: 0,
};

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-01',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

const props = {
  catalogue, onSaved: vi.fn(), onCancel: vi.fn(), onAddNew: vi.fn(),
  today: new Date(2026, 8, 19),
};

beforeEach(async () => {
  await db.batches.clear();
  vi.clearAllMocks();
});

describe('AddBatchForm creating', () => {
  it('defaults the purchase date to today', () => {
    render(<AddBatchForm {...props} />);
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-09-19');
  });

  it('saves a batch and hands it back', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);

    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '18.50' } });
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'Pasar Chow Kit' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.batches.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.rawWeightG).toBe(1000);
    expect(saved[0]!.purchase.pricePaidMYR).toBe(18.5);
    expect(saved[0]!.purchase.location).toBe('Pasar Chow Kit');
    expect(saved[0]!.purchase.date).toBe('2026-09-19');
  });

  it('requires an ingredient', async () => {
    render(<AddBatchForm {...props} />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ingredient/i);
  });

  it('requires a weight', async () => {
    render(<AddBatchForm {...props} initialIngredientId="chicken-breast" />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/weigh/i);
  });

  it('rejects a negative price', async () => {
    // Note: a non-numeric value cannot be tested here. The price field is
    // <input type="number">, and jsdom blanks the value on assignment, so
    // "free" would arrive as '' and be read as "not recorded".
    render(<AddBatchForm {...props} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/price/i);
  });

  it('accepts a price of zero, because food is sometimes given to you', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('accepts a blank location, because you do not always remember', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await db.batches.toArray())[0]!.purchase.location).toBe('');
  });
});

describe('AddBatchForm editing', () => {
  it('prefills every field from the batch', () => {
    render(<AddBatchForm {...props} batch={existing} sessions={[]} />);
    expect(screen.getByLabelText(/^raw weight/i)).toHaveValue(1000);
    expect(screen.getByLabelText(/price/i)).toHaveValue(20);
    expect(screen.getByLabelText(/where/i)).toHaveValue('Pasar Chow Kit');
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-09-01');
  });

  it('keeps the same id so the sessions stay attached', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} batch={existing} sessions={[]} />);
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.batches.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe('b1');
    expect(saved[0]!.purchase.pricePaidMYR).toBe(21);
  });

  it('blocks shrinking the weight below what has already been cooked', async () => {
    render(<AddBatchForm {...props} batch={existing} sessions={[session({ rawUsedG: g(400) })]} />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('400g');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/components/AddBatchForm.test.tsx
```

Expected: FAIL — `Failed to resolve import "./AddBatchForm"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/components/AddBatchForm.tsx`:

```tsx
import { useState } from 'react';
import { validateRawWeightEdit } from '../../core/batch';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { g, myr, type Grams } from '../../core/units';
import { saveBatch } from '../../storage/kitchen';
import { todayIso } from '../dates';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

interface Props {
  catalogue: readonly Ingredient[];
  /** Present when editing; absent when creating. */
  batch?: Batch;
  /** Required when editing, to guard a reduced purchase weight. */
  sessions?: readonly CookSession[];
  initialIngredientId?: string;
  initialRawWeightG?: Grams;
  /** Injected so the default date is testable, as in Phase 1's CalcScreen. */
  today?: Date;
  onSaved: (batch: Batch) => void;
  onCancel: () => void;
  onAddNew: (typedName: string) => void;
}

export function AddBatchForm({
  catalogue, batch, sessions = [], initialIngredientId, initialRawWeightG,
  today = new Date(), onSaved, onCancel, onAddNew,
}: Props) {
  const editing = batch !== undefined;

  const [ingredientId, setIngredientId] = useState(
    batch?.ingredientId ?? initialIngredientId ?? '',
  );
  const [rawWeightG, setRawWeightG] = useState<Grams>(
    batch?.rawWeightG ?? initialRawWeightG ?? g(0),
  );
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [priceText, setPriceText] = useState(
    batch === undefined ? '' : `${batch.purchase.pricePaidMYR}`,
  );
  const [location, setLocation] = useState(batch?.purchase.location ?? '');
  const [date, setDate] = useState(batch?.purchase.date ?? todayIso(today));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (ingredientId === '') { setError('Pick an ingredient first.'); return; }
    if (rawWeightG <= 0) { setError('Weigh the raw ingredient and enter it.'); return; }

    // Blank means "not recorded", which is a real answer for a gift or a
    // forgotten receipt. Anything non-blank has to be a number.
    const trimmed = priceText.trim();
    const price = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter the price paid as a number, or leave it blank.');
      return;
    }

    if (date.trim() === '') { setError('Enter the date you bought this.'); return; }

    if (editing) {
      const check = validateRawWeightEdit(batch, sessions, rawWeightG);
      if (!check.ok) { setError(check.message); return; }
    }

    setError(null);
    const saved: Batch = {
      // The same id on an edit is what keeps this batch's cook sessions attached.
      id: batch?.id ?? newId(),
      ingredientId,
      rawWeightG,
      purchase: { pricePaidMYR: myr(price), location: location.trim(), date },
      createdAt: batch?.createdAt ?? Date.now(),
    };

    await saveBatch(saved);
    onSaved(saved);
  };

  return (
    <div className="screen">
      <h3>{editing ? 'Edit this batch' : 'Log a purchase'}</h3>

      <IngredientPicker
        catalogue={catalogue}
        value={ingredientId}
        onChange={setIngredientId}
        onAddNew={onAddNew}
      />

      <WeightInput
        label="Raw weight"
        value={rawWeightG}
        unit={unit}
        onChange={setRawWeightG}
        onUnitChange={setUnit}
      />

      <div className="field">
        <label htmlFor="batch-price">Price paid (RM)</label>
        <input
          id="batch-price"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="batch-location">Where from</label>
        <input
          id="batch-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="batch-date">Date bought</label>
        <input
          id="batch-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error !== null && <p role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void submit(); }}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/AddBatchForm.test.tsx
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/AddBatchForm.tsx src/ui/components/AddBatchForm.test.tsx
git commit -m "feat: add the batch purchase form, creating and editing

A blank price and a blank location are accepted: food is sometimes given to
you, and you do not always remember the stall. An edit keeps the batch id so
its cook sessions stay attached, and a reduced weight is checked against what
has already been cooked."
```

---

## Task 11: The cook-session form

**Files:**
- Create: `src/ui/components/CookSessionForm.tsx`
- Create: `src/ui/components/CookSessionForm.test.tsx`

**Interfaces:**
- Consumes: `rawRemainingG`, `validateCook`, `validateRawUsedEdit`, `rescaleCookedRemaining` from `src/core/batch.ts`; `flagYield` from `src/core/calibration.ts`; `resolveYield` from `src/core/yieldResolver.ts`; `CATEGORY_YIELD`; `WeightInput`; `YieldBadge`; `METHOD_LABELS`; `saveCookSession`
- Produces: `CookSessionForm` with props `{ batch, ingredient, sessions, samples, session?, today?, onSaved, onCancel }`

The form defaults `rawUsedG` to the whole remainder, so cooking a pack in one
go is a single tap — the parent spec's reason for having no separate
"cook everything" code path.

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/CookSessionForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CookSessionForm } from './CookSessionForm';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0,
};

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

const props = {
  batch,
  ingredient: bundled('chicken-breast'),
  sessions: [] as CookSession[],
  samples: [],
  today: new Date(2026, 8, 19),
  onSaved: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('CookSessionForm', () => {
  it('defaults the raw weight to the whole remainder, so one tap cooks the pack', () => {
    render(<CookSessionForm {...props} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(1000);
  });

  it('defaults to what is left after earlier cooks', () => {
    render(<CookSessionForm {...props} sessions={[session({ rawUsedG: g(400) })]} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(600);
  });

  it('shows whose yield figure the estimate is using', () => {
    render(<CookSessionForm {...props} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/published factor/i);
  });

  it('shows the measured figure once the user has cooks logged', () => {
    const samples = [
      { ingredientId: 'chicken-breast', method: 'roasted' as const, rawUsedG: g(400), cookedWeightG: g(300), excludeFromCalibration: false },
    ];
    render(<CookSessionForm {...props} samples={samples} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/your average across 1 cook/i);
  });

  it('saves a session with the cooked weight as the starting remainder', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '284' } });
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.cookSessions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.batchId).toBe('b1');
    expect(saved[0]!.cookedWeightG).toBe(284);
    expect(saved[0]!.cookedRemainingG).toBe(284);
    expect(saved[0]!.excludeFromCalibration).toBe(false);
  });

  it('blocks cooking more than is left and says how much that is', async () => {
    render(<CookSessionForm {...props} sessions={[session({ rawUsedG: g(800) })]} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '284' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('200g');
  });

  it('warns about an unusual yield without refusing to save it', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    // 0.45 against chicken-breast's published 0.71: 37% off, past the 35% band.
    // 0.50 would NOT flag — it is only 30% off — so do not "simplify" this.
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '180' } });

    expect(screen.getByTestId('outlier-warning')).toHaveTextContent('45%');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('refuses a transposed digit', async () => {
    render(<CookSessionForm {...props} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/check both weights/i);
  });

  it('prefills from an existing session when editing', () => {
    render(<CookSessionForm {...props} sessions={[session()]} session={session()} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(400);
    expect(screen.getByLabelText(/cooked weight/i)).toHaveValue(284);
    expect(screen.getByLabelText(/portions/i)).toHaveValue(2);
  });

  it('rescales the remainder when an edited cooked weight is corrected', async () => {
    // 80g logged for what was really 800g, half eaten: the correction must
    // leave it half remaining, not 40g out of 800g.
    const wrong = session({ cookedWeightG: g(80), cookedRemainingG: g(40) });
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} sessions={[wrong]} session={wrong} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.cookSessions.toArray())[0]!;
    expect(saved.cookedWeightG).toBe(800);
    expect(saved.cookedRemainingG).toBe(400);
  });

  it('keeps the same id when editing, so calibration does not double-count', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} sessions={[session()]} session={session()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.cookSessions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe('s1');
    expect(saved[0]!.portionCount).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/components/CookSessionForm.test.tsx
```

Expected: FAIL — `Failed to resolve import "./CookSessionForm"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/components/CookSessionForm.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  rawRemainingG, rescaleCookedRemaining, validateCook, validateRawUsedEdit,
} from '../../core/batch';
import { flagYield } from '../../core/calibration';
import { COOK_METHODS, type Batch, type CookMethod, type CookSession, type Ingredient, type YieldSample } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { resolveYield } from '../../core/yieldResolver';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { saveCookSession } from '../../storage/kitchen';
import { todayIso } from '../dates';
import { METHOD_LABELS } from '../labels';
import { newId } from '../newId';
import { WeightInput, type WeightUnit } from './WeightInput';
import { YieldBadge } from './YieldBadge';

interface Props {
  batch: Batch;
  ingredient: Ingredient;
  /** Every session of this batch, including the one being edited. */
  sessions: readonly CookSession[];
  /** All samples across the kitchen, so the badge can show a measured factor. */
  samples: readonly YieldSample[];
  /** Present when editing. */
  session?: CookSession;
  today?: Date;
  onSaved: (session: CookSession) => void;
  onCancel: () => void;
}

export function CookSessionForm({
  batch, ingredient, sessions, samples, session, today = new Date(), onSaved, onCancel,
}: Props) {
  const editing = session !== undefined;

  // Cooking the whole remainder is the common case, so it is the default.
  const defaultRaw = session?.rawUsedG ?? rawRemainingG(batch, sessions);

  const [method, setMethod] = useState<CookMethod>(session?.method ?? 'roasted');
  const [rawUsedG, setRawUsedG] = useState<Grams>(defaultRaw);
  const [rawUnit, setRawUnit] = useState<WeightUnit>('g');
  const [cookedWeightG, setCookedWeightG] = useState<Grams>(session?.cookedWeightG ?? g(0));
  const [cookedUnit, setCookedUnit] = useState<WeightUnit>('g');
  const [portionText, setPortionText] = useState(`${session?.portionCount ?? 1}`);
  const [cookedAt, setCookedAt] = useState(session?.cookedAt ?? todayIso(today));
  const [error, setError] = useState<string | null>(null);

  const resolved = useMemo(
    () => resolveYield(ingredient, method, samples, CATEGORY_YIELD),
    [ingredient, method, samples],
  );

  // Advisory, and shown live: the user is standing at the scale and can still
  // re-read it. Blocking happens in validateCook, which only refuses the
  // impossible band.
  const flag = useMemo(
    () => (cookedWeightG > 0 && rawUsedG > 0
      ? flagYield({ method, rawUsedG, cookedWeightG }, ingredient, CATEGORY_YIELD)
      : null),
    [method, rawUsedG, cookedWeightG, ingredient],
  );

  const submit = async () => {
    const portionCount = Number(portionText.trim());
    const draft = { method, rawUsedG, cookedWeightG, portionCount, cookedAt };

    // When editing, this session's own raw weight must be measured against
    // what the OTHER sessions left, not against the whole-batch remainder
    // that already has this session subtracted from it.
    const check = editing
      ? validateRawUsedEdit(batch, sessions, session.id, rawUsedG)
      : validateCook(batch, sessions, draft, ingredient, CATEGORY_YIELD);
    if (!check.ok) { setError(check.message); return; }

    if (editing) {
      const rest = validateCook(
        batch,
        sessions.filter((s) => s.id !== session.id),
        draft,
        ingredient,
        CATEGORY_YIELD,
      );
      if (!rest.ok) { setError(rest.message); return; }
    }

    setError(null);
    const saved: CookSession = {
      id: session?.id ?? newId(),
      batchId: batch.id,
      method,
      rawUsedG,
      cookedWeightG,
      // A new session has eaten nothing. An edited one keeps the fraction
      // already eaten rather than the grams, which were a reading of the
      // same food.
      cookedRemainingG: editing
        ? rescaleCookedRemaining(session, cookedWeightG)
        : cookedWeightG,
      cookedAt,
      portionCount,
      excludeFromCalibration: session?.excludeFromCalibration ?? false,
    };

    await saveCookSession(saved);
    onSaved(saved);
  };

  return (
    <div className="screen">
      <h3>{editing ? 'Edit this cook' : `Cook some ${ingredient.name.toLowerCase()}`}</h3>

      <div className="field">
        <label htmlFor="cook-method">Cooking method</label>
        <select
          id="cook-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as CookMethod)}
        >
          {COOK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
      </div>

      <YieldBadge resolved={resolved} published={ingredient.publishedYield[method]} />

      <WeightInput
        label="Raw weight used"
        value={rawUsedG}
        unit={rawUnit}
        onChange={setRawUsedG}
        onUnitChange={setRawUnit}
      />

      <WeightInput
        label="Cooked weight"
        value={cookedWeightG}
        unit={cookedUnit}
        onChange={setCookedWeightG}
        onUnitChange={setCookedUnit}
      />

      {flag !== null && (
        <p className={`flag flag--${flag.kind}`} data-testid="outlier-warning">
          {flag.reason}
        </p>
      )}

      <div className="field">
        <label htmlFor="cook-portions">Portions</label>
        <input
          id="cook-portions"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={portionText}
          onChange={(e) => setPortionText(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="cook-date">Date cooked</label>
        <input
          id="cook-date"
          type="date"
          value={cookedAt}
          onChange={(e) => setCookedAt(e.target.value)}
        />
      </div>

      {error !== null && <p role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void submit(); }}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/CookSessionForm.test.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/CookSessionForm.tsx src/ui/components/CookSessionForm.test.tsx
git commit -m "feat: add the cook session form with live yield feedback

Defaults the raw weight to the whole remainder, so cooking a pack in one go is
a single tap. An unusual yield is warned about live but still saved; only the
impossible band is refused. Editing keeps the session id and rescales the
remainder by the fraction already eaten."
```

---

## Task 12: The eat control

**Files:**
- Create: `src/ui/components/EatControl.tsx`
- Create: `src/ui/components/EatControl.test.tsx`

**Interfaces:**
- Consumes: `applyEat`, `portionsToGrams`, `portionsRemaining`, `portionWeightG`, `validateEat` from `src/core/batch.ts`; `formatG` from `src/core/units.ts`; `saveCookSession` from `src/storage/kitchen.ts`
- Produces: `EatControl` with props `{ session, onEaten }`

Eating decrements `cookedRemainingG` and writes nothing else. Phase 3
introduces meals as the record of where the food went; addendum §2.2.

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/EatControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EatControl } from './EatControl';
import { db } from '../../storage/db';
import { g } from '../../core/units';
import type { CookSession } from '../../core/types';

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(296), cookedRemainingG: g(296), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('EatControl', () => {
  it('shows what is left in both grams and portions', () => {
    render(<EatControl session={session({ cookedRemainingG: g(148) })} onEaten={vi.fn()} />);
    expect(screen.getByTestId('remaining')).toHaveTextContent('148g');
    expect(screen.getByTestId('remaining')).toHaveTextContent('1.0');
  });

  it('eating one portion subtracts that portion weight', async () => {
    const onEaten = vi.fn();
    await db.cookSessions.put(session());
    render(<EatControl session={session()} onEaten={onEaten} />);

    fireEvent.click(screen.getByRole('button', { name: /eat 1 portion/i }));

    await waitFor(() => expect(onEaten).toHaveBeenCalled());
    expect((await db.cookSessions.toArray())[0]!.cookedRemainingG).toBe(148);
  });

  it('eating a weighed amount subtracts exactly that', async () => {
    const onEaten = vi.fn();
    await db.cookSessions.put(session());
    render(<EatControl session={session()} onEaten={onEaten} />);

    fireEvent.change(screen.getByLabelText(/weighed amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^eat this much/i }));

    await waitFor(() => expect(onEaten).toHaveBeenCalled());
    expect((await db.cookSessions.toArray())[0]!.cookedRemainingG).toBe(196);
  });

  it('blocks eating more than is left, reporting grams and portions', async () => {
    render(<EatControl session={session({ cookedRemainingG: g(148) })} onEaten={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/weighed amount/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /^eat this much/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('148g');
    expect(screen.getByRole('alert')).toHaveTextContent('1.0');
  });

  it('blocks eating a portion when less than a portion is left', async () => {
    render(<EatControl session={session({ cookedRemainingG: g(50) })} onEaten={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /eat 1 portion/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('50g');
  });

  it('offers nothing to eat once the session is finished', () => {
    render(<EatControl session={session({ cookedRemainingG: g(0) })} onEaten={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /eat 1 portion/i })).toBeNull();
    expect(screen.getByTestId('remaining')).toHaveTextContent(/all eaten/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/components/EatControl.test.tsx
```

Expected: FAIL — `Failed to resolve import "./EatControl"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/components/EatControl.tsx`:

```tsx
import { useState } from 'react';
import {
  applyEat, portionsRemaining, portionsToGrams, portionWeightG, validateEat,
} from '../../core/batch';
import type { CookSession } from '../../core/types';
import { formatG, g, type Grams } from '../../core/units';
import { saveCookSession } from '../../storage/kitchen';

/**
 * Eating decrements the stored remainder and writes nothing else. Phase 3
 * introduces meals as the record of where the food went; until then the
 * question this screen answers is only "how much is left".
 */
export function EatControl({
  session, onEaten,
}: { session: CookSession; onEaten: (updated: CookSession) => void }) {
  const [weighedText, setWeighedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = session.cookedRemainingG;
  const portionsLeft = portionsRemaining(session);
  const finished = remaining <= 0;

  const eat = async (grams: Grams) => {
    const check = validateEat(session, grams);
    if (!check.ok) { setError(check.message); return; }

    setError(null);
    const updated = applyEat(session, grams);
    await saveCookSession(updated);
    setWeighedText('');
    onEaten(updated);
  };

  const eatWeighed = () => {
    const parsed = Number(weighedText.trim());
    if (weighedText.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setError('Enter how much you ate, in grams.');
      return;
    }
    void eat(g(parsed));
  };

  return (
    <div className="eat">
      <p className="eat__remaining" data-testid="remaining">
        {finished
          ? 'All eaten'
          : `${formatG(remaining)} left · ${portionsLeft.toFixed(1)} portions`}
      </p>

      {!finished && (
        <>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => { void eat(portionsToGrams(session, 1)); }}
            >
              Eat 1 portion ({formatG(portionWeightG(session))})
            </button>
          </div>

          <div className="field">
            <label htmlFor={`weighed-${session.id}`}>Weighed amount (g)</label>
            <input
              id={`weighed-${session.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={weighedText}
              onChange={(e) => setWeighedText(e.target.value)}
            />
          </div>

          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={eatWeighed}>
              Eat this much
            </button>
          </div>
        </>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/EatControl.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/EatControl.tsx src/ui/components/EatControl.test.tsx
git commit -m "feat: add the eat control for portions and weighed amounts

Both paths subtract grams, because grams are what is authoritative; the portion
button just converts first. Over-eating is blocked with the remainder shown in
whichever unit the user is thinking in."
```

---

## Task 13: The session row

**Files:**
- Create: `src/ui/components/SessionRow.tsx`
- Create: `src/ui/components/SessionRow.test.tsx`

**Interfaces:**
- Consumes: `flagYield` from `src/core/calibration.ts`; `costPerPortion` from `src/core/cost.ts`; `EatControl`, `METHOD_LABELS`, `formatIsoDate`; `saveCookSession`, `deleteCookSession`
- Produces: `SessionRow` with props `{ batch, ingredient, session, onChanged, onEdit }`

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/SessionRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionRow } from './SessionRow';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0,
};

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

const props = {
  batch, ingredient: bundled('chicken-breast'),
  onChanged: vi.fn(), onEdit: vi.fn(),
};

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('SessionRow', () => {
  it('names the method in words rather than camelCase', () => {
    render(<SessionRow {...props} session={session({ method: 'stirFried' })} />);
    expect(screen.getByTestId('session-summary')).toHaveTextContent('Stir-fried');
    expect(screen.getByTestId('session-summary')).not.toHaveTextContent('stirFried');
  });

  it('shows what this cook turned into and what it cost per portion', () => {
    render(<SessionRow {...props} session={session()} />);
    expect(screen.getByTestId('session-summary')).toHaveTextContent('400g');
    expect(screen.getByTestId('session-summary')).toHaveTextContent('284g');
    // RM20 for 1000g, 400g used, 2 portions -> RM4.00.
    expect(screen.getByTestId('session-cost')).toHaveTextContent('RM4.00');
  });

  it('says nothing about an ordinary cook', () => {
    render(<SessionRow {...props} session={session()} />);
    expect(screen.queryByTestId('outlier-flag')).toBeNull();
  });

  it('flags an unusual cook with its reason', () => {
    // 0.45 against chicken-breast's published 0.71: 37% off, past the 35% band.
    render(<SessionRow {...props} session={session({ cookedWeightG: g(180), cookedRemainingG: g(180) })} />);
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('45%');
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('71%');
  });

  it('excludes a bad reading from calibration without deleting the cook', async () => {
    await db.cookSessions.put(session());
    const onChanged = vi.fn();
    render(<SessionRow {...props} session={session()} onChanged={onChanged} />);

    fireEvent.click(screen.getByLabelText(/ignore this cook/i));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const saved = (await db.cookSessions.toArray())[0]!;
    expect(saved.excludeFromCalibration).toBe(true);
    expect(saved.cookedWeightG).toBe(284);
  });

  it('puts an excluded cook back into calibration on a second tap', async () => {
    await db.cookSessions.put(session({ excludeFromCalibration: true }));
    render(<SessionRow {...props} session={session({ excludeFromCalibration: true })} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/ignore this cook/i));

    await waitFor(async () => {
      expect((await db.cookSessions.toArray())[0]!.excludeFromCalibration).toBe(false);
    });
  });

  it('asks before deleting a cook, naming what is left of it', () => {
    render(<SessionRow {...props} session={session()} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('284g');
  });

  it('deletes the cook on confirmation', async () => {
    await db.cookSessions.put(session());
    const onChanged = vi.fn();
    render(<SessionRow {...props} session={session()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await db.cookSessions.toArray()).toEqual([]);
  });

  it('abandons the delete on a change of mind', async () => {
    await db.cookSessions.put(session());
    render(<SessionRow {...props} session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect((await db.cookSessions.toArray())).toHaveLength(1);
  });

  it('hands the session up for editing', () => {
    const onEdit = vi.fn();
    render(<SessionRow {...props} session={session()} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/components/SessionRow.test.tsx
```

Expected: FAIL — `Failed to resolve import "./SessionRow"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/components/SessionRow.tsx`:

```tsx
import { useState } from 'react';
import { flagYield } from '../../core/calibration';
import { costPerPortion } from '../../core/cost';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { formatG, formatMYR } from '../../core/units';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { deleteCookSession, saveCookSession } from '../../storage/kitchen';
import { formatIsoDate } from '../dates';
import { METHOD_LABELS } from '../labels';
import { EatControl } from './EatControl';

interface Props {
  batch: Batch;
  ingredient: Ingredient | null;
  session: CookSession;
  onChanged: () => void;
  onEdit: (session: CookSession) => void;
}

export function SessionRow({ batch, ingredient, session, onChanged, onEdit }: Props) {
  const [confirming, setConfirming] = useState(false);

  const flag = ingredient === null ? null : flagYield(session, ingredient, CATEGORY_YIELD);
  const perPortion = costPerPortion(batch, session);

  const toggleExclude = async () => {
    await saveCookSession({ ...session, excludeFromCalibration: !session.excludeFromCalibration });
    onChanged();
  };

  const remove = async () => {
    await deleteCookSession(session.id);
    setConfirming(false);
    onChanged();
  };

  return (
    <div className="session">
      <p className="session__summary" data-testid="session-summary">
        {METHOD_LABELS[session.method]} · {formatG(session.rawUsedG)} raw →{' '}
        {formatG(session.cookedWeightG)} cooked · {session.portionCount} portions ·{' '}
        {formatIsoDate(session.cookedAt)}
      </p>

      {perPortion !== null && (
        <p className="session__cost" data-testid="session-cost">
          {formatMYR(perPortion)} per portion
        </p>
      )}

      {/* Advisory, never blocking: the cook is kept and the user decides. */}
      {flag !== null && (
        <p className={`flag flag--${flag.kind}`} data-testid="outlier-flag">
          {flag.reason}
        </p>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={session.excludeFromCalibration}
          onChange={() => { void toggleExclude(); }}
        />
        Ignore this cook when working out my yields
      </label>

      <EatControl session={session} onEaten={onChanged} />

      {confirming ? (
        <>
          <p role="alert">
            Delete this cook? {formatG(session.cookedRemainingG)} of it is still
            unaccounted for, and its raw weight goes back to the batch.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, delete it
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(session)}>
            Edit
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the money formatter**

Append to `src/core/units.ts`:

```ts
/** Always two decimals: prices are read against a receipt. */
export const formatMYR = (v: MYR): string =>
  `RM${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/SessionRow.test.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/SessionRow.tsx src/ui/components/SessionRow.test.tsx src/core/units.ts
git commit -m "feat: add the cook session row

An outlier is flagged with its reason and excluded with one tap, never deleted:
the parent spec keeps the bad reading and only removes it from the yield mean.
Deleting a cook asks first and says its raw weight returns to the batch."
```

---

## Task 14: The batch card

**Files:**
- Create: `src/ui/components/BatchCard.tsx`
- Create: `src/ui/components/BatchCard.test.tsx`

**Interfaces:**
- Consumes: `batchState`, `rawRemainingG`, `sessionsOf` from `src/core/batch.ts`; `costPerKgRaw`, `costPerKgCooked`, `proteinPerMYRRaw`, `proteinPerMYRRetained` from `src/core/cost.ts`; `RETENTION`; `SessionRow`; `STATE_LABELS`; `formatIsoDate`; `deleteBatchCascade`
- Produces: `BatchCard` with props `{ batch, ingredient, sessions, onChanged, onCook, onEditBatch, onEditSession }`

- [ ] **Step 1: Write the failing test**

Create `src/ui/components/BatchCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchCard } from './BatchCard';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 0, ...over,
});

const session = (id: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId: 'b1', method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false, ...over,
});

const props = {
  ingredient: bundled('chicken-breast'),
  onChanged: vi.fn(), onCook: vi.fn(), onEditBatch: vi.fn(), onEditSession: vi.fn(),
};

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('BatchCard', () => {
  it('shows the purchase, its state and what is left to cook', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[]} />);
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Raw');
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent('1,000g');
    expect(screen.getByTestId('batch-purchase')).toHaveTextContent('Pasar Chow Kit');
    expect(screen.getByTestId('batch-purchase')).toHaveTextContent('RM20.00');
  });

  it('shows protein per ringgit before anything is cooked, which is the buying number', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[]} />);
    // 1000g of chicken breast at 22.5g/100g = 225g protein for RM20 = 11.25,
    // rendered to one decimal.
    expect(screen.getByTestId('batch-cost')).toHaveTextContent('11.3');
  });

  it('reports the state as part cooked once some is used', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} />);
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Part cooked');
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent('600g');
  });

  it('renders a single cook flat, with no list around it', () => {
    // The parent spec: a batch cooked in one sitting must not show the extra
    // structure that multiple sittings need.
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByTestId('session-summary')).toBeInTheDocument();
  });

  it('renders several cooks as a list', () => {
    const sessions = [session('s1', { rawUsedG: g(400) }), session('s2', { rawUsedG: g(600) })];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByTestId('session-summary')).toHaveLength(2);
  });

  it('ignores sessions belonging to other batches', () => {
    const sessions = [session('s1'), { ...session('s9'), batchId: 'b2' }];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    expect(screen.getAllByTestId('session-summary')).toHaveLength(1);
  });

  it('offers to cook while raw weight is left', () => {
    const onCook = vi.fn();
    render(<BatchCard {...props} batch={batch()} sessions={[]} onCook={onCook} />);
    fireEvent.click(screen.getByRole('button', { name: /cook/i }));
    expect(onCook).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  });

  it('stops offering to cook once the batch is used up', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1', { rawUsedG: g(1000) })]} />);
    expect(screen.queryByRole('button', { name: /cook/i })).toBeNull();
  });

  it('names what a delete will take with it', () => {
    const sessions = [session('s1', { rawUsedG: g(400) }), session('s2', { rawUsedG: g(300) })];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('2 cooks');
    expect(alert).toHaveTextContent('568g');
  });

  it('deletes the batch and its cooks on confirmation', async () => {
    await db.batches.put(batch());
    await db.cookSessions.put(session('s1'));
    const onChanged = vi.fn();
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await db.batches.toArray()).toEqual([]);
    expect(await db.cookSessions.toArray()).toEqual([]);
  });

  it('still works when the ingredient has been archived out of the catalogue', () => {
    // Ingredients are archived, never deleted, precisely because batches
    // reference them — but an archived one is filtered out of the catalogue,
    // so the card must not assume it can be found.
    render(<BatchCard {...props} ingredient={null} batch={batch()} sessions={[]} />);
    expect(screen.getByTestId('batch-name')).toHaveTextContent(/no longer in your list/i);
    expect(screen.queryByTestId('batch-cost')).toBeNull();
    expect(screen.getByRole('button', { name: /delete batch/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/components/BatchCard.test.tsx
```

Expected: FAIL — `Failed to resolve import "./BatchCard"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/components/BatchCard.tsx`:

```tsx
import { useState } from 'react';
import { batchState, rawRemainingG, sessionsOf } from '../../core/batch';
import {
  costPerKgCooked, costPerKgRaw, proteinPerMYRRaw, proteinPerMYRRetained,
} from '../../core/cost';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { formatG, formatMYR } from '../../core/units';
import { RETENTION } from '../../data/retentionTable';
import { deleteBatchCascade } from '../../storage/kitchen';
import { formatIsoDate } from '../dates';
import { STATE_LABELS } from '../labels';
import { SessionRow } from './SessionRow';

interface Props {
  batch: Batch;
  /**
   * Null when the ingredient has been archived out of the catalogue. Archiving
   * rather than deleting is what keeps this batch meaningful at all, but the
   * card still has to render without it.
   */
  ingredient: Ingredient | null;
  /** Every session in the kitchen; the card filters to its own. */
  sessions: readonly CookSession[];
  onChanged: () => void;
  onCook: (batch: Batch) => void;
  onEditBatch: (batch: Batch) => void;
  onEditSession: (batch: Batch, session: CookSession) => void;
}

export function BatchCard({
  batch, ingredient, sessions, onChanged, onCook, onEditBatch, onEditSession,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  const mine = sessionsOf(batch.id, sessions);
  const state = batchState(batch, sessions);
  const remaining = rawRemainingG(batch, sessions);
  const cookedLeft = mine.reduce((sum, s) => sum + s.cookedRemainingG, 0);

  const perKgRaw = costPerKgRaw(batch);
  const perKgCooked = costPerKgCooked(batch, sessions);
  const proteinRaw = ingredient === null ? null : proteinPerMYRRaw(batch, ingredient);
  const proteinCooked = ingredient === null
    ? null
    : proteinPerMYRRetained(batch, ingredient, sessions, RETENTION);

  const remove = async () => {
    await deleteBatchCascade(batch.id);
    setConfirming(false);
    onChanged();
  };

  return (
    <article className="card batch">
      <h3 className="card__title" data-testid="batch-name">
        {ingredient?.name ?? 'This ingredient is no longer in your list'}
      </h3>

      <p className="batch__state" data-testid="batch-state">{STATE_LABELS[state]}</p>

      <p className="batch__remaining" data-testid="batch-remaining">
        {formatG(remaining)} raw left
        {cookedLeft > 0 && ` · ${formatG(cookedLeft)} cooked left`}
      </p>

      <p className="batch__purchase" data-testid="batch-purchase">
        {formatG(batch.rawWeightG)} for {formatMYR(batch.purchase.pricePaidMYR)}
        {batch.purchase.location !== '' && ` · ${batch.purchase.location}`}
        {' · '}{formatIsoDate(batch.purchase.date)}
      </p>

      {/* Cost needs the ingredient for its protein figures, so the whole block
          goes when the ingredient has been archived away. */}
      {ingredient !== null && (
        <p className="batch__cost" data-testid="batch-cost">
          {perKgRaw !== null && `${formatMYR(perKgRaw)}/kg raw`}
          {perKgCooked !== null && ` · ${formatMYR(perKgCooked)}/kg cooked`}
          {proteinRaw !== null && ` · ${proteinRaw.toFixed(1)}g protein per RM`}
          {proteinCooked !== null && ` (${proteinCooked.toFixed(1)}g after cooking)`}
        </p>
      )}

      {/* A batch cooked in one sitting renders flat: the list structure that
          several sittings need would only be noise around a single row. */}
      {mine.length === 1 && (
        <SessionRow
          batch={batch}
          ingredient={ingredient}
          session={mine[0]!}
          onChanged={onChanged}
          onEdit={(s) => onEditSession(batch, s)}
        />
      )}

      {mine.length > 1 && (
        <ul className="batch__sessions">
          {mine.map((s) => (
            <li key={s.id}>
              <SessionRow
                batch={batch}
                ingredient={ingredient}
                session={s}
                onChanged={onChanged}
                onEdit={(edited) => onEditSession(batch, edited)}
              />
            </li>
          ))}
        </ul>
      )}

      {confirming ? (
        <>
          <p role="alert">
            Delete this batch? Its {mine.length} cook{mine.length === 1 ? '' : 's'} go
            with it, including {formatG(cookedLeft)} of cooked food still unaccounted for.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, delete it
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          {remaining > 0 && ingredient !== null && (
            <button type="button" className="btn btn--primary" onClick={() => onCook(batch)}>
              Cook some
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => onEditBatch(batch)}>
            Edit purchase
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
            Delete batch
          </button>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/components/BatchCard.test.tsx
```

Expected: PASS, 12 tests. If the protein-per-RM assertion is off, read the real
`chicken-breast` protein figure out of `src/data/ingredients.ts` and correct the
expectation — do not change the arithmetic to fit a guessed number.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/BatchCard.tsx src/ui/components/BatchCard.test.tsx
git commit -m "feat: add the batch card

A single cook renders flat, so the structure several sittings need never shows
up around one row. Handles an archived ingredient, which the catalogue filters
out but a batch still references — archiving rather than deleting is the whole
reason these rows stay meaningful."
```

---

## Task 15: The Kitchen screen

**Files:**
- Create: `src/ui/screens/KitchenScreen.tsx`
- Create: `src/ui/screens/KitchenScreen.test.tsx`

**Interfaces:**
- Consumes: `useKitchen`, `useCatalogue`, `batchState`, `BatchCard`, `AddBatchForm`, `CookSessionForm`, `AddIngredientScreen`
- Produces: `KitchenScreen` with props `{ today? }`

The screen owns one piece of state — which of four things is on screen: the
list, the batch form, the cook form, or the add-ingredient flow. Everything
else is derived.

- [ ] **Step 1: Write the failing test**

Create `src/ui/screens/KitchenScreen.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KitchenScreen } from './KitchenScreen';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import type { Batch, CookSession } from '../../core/types';

const batch = (id: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0, ...over,
});

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(1000), cookedWeightG: g(710),
  cookedRemainingG: g(710), cookedAt: '2026-09-19', portionCount: 4,
  excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
});

describe('KitchenScreen', () => {
  it('invites a first purchase when the kitchen is empty', async () => {
    render(<KitchenScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument();
    });
  });

  it('groups batches by their derived state', async () => {
    await db.batches.bulkPut([batch('b1'), batch('b2'), batch('b3')]);
    // b2 fully cooked with food left; b3 fully cooked and fully eaten.
    await db.cookSessions.bulkPut([
      session('s2', 'b2'),
      session('s3', 'b3', { cookedRemainingG: g(0) }),
    ]);

    render(<KitchenScreen />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^raw$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /^cooked$/i })).toBeInTheDocument();
    // Finished batches are hidden behind a toggle: a kitchen accumulates them
    // forever, and this is a phone screen.
    expect(screen.queryByRole('heading', { name: /^finished$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /finished \(1\)/i })).toBeInTheDocument();
  });

  it('reveals finished batches on request', async () => {
    await db.batches.put(batch('b3'));
    await db.cookSessions.put(session('s3', 'b3', { cookedRemainingG: g(0) }));

    render(<KitchenScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /finished \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /finished \(1\)/i }));
    expect(screen.getByRole('heading', { name: /^finished$/i })).toBeInTheDocument();
  });

  it('opens the purchase form and shows the new batch afterwards', async () => {
    render(<KitchenScreen today={new Date(2026, 8, 19)} />);
    await waitFor(() => { expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /log a purchase/i }));
    expect(screen.getByLabelText(/^raw weight/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // No ingredient was chosen, so it must complain rather than save.
    expect(await screen.findByRole('alert')).toHaveTextContent(/ingredient/i);
  });

  it('returns to the list when the purchase form is cancelled', async () => {
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /log a purchase/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument();
  });

  it('opens the cook form from a raw batch', async () => {
    await db.batches.put(batch('b1'));
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('batch-state')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /cook some/i }));
    expect(screen.getByLabelText(/raw weight used/i)).toBeInTheDocument();
  });

  it('shows a cook on the batch after saving it', async () => {
    await db.batches.put(batch('b1'));
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('batch-state')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /cook some/i }));
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '710' } });
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByTestId('session-summary')).toHaveTextContent('710g');
    });
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Cooked');
  });
});
```

The storage-failure path is covered in `useKitchen.test.ts` (Task 8), which
drives the state this screen only renders. Do not add a screen-level test for
it here.

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/ui/screens/KitchenScreen.test.tsx
```

Expected: FAIL — `Failed to resolve import "./KitchenScreen"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/screens/KitchenScreen.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { batchState, type BatchState } from '../../core/batch';
import type { Batch, CookSession } from '../../core/types';
import { AddBatchForm } from '../components/AddBatchForm';
import { BatchCard } from '../components/BatchCard';
import { CookSessionForm } from '../components/CookSessionForm';
import { STATE_LABELS } from '../labels';
import { useCatalogue } from '../useCatalogue';
import { useKitchen } from '../useKitchen';
import { AddIngredientScreen } from './AddIngredientScreen';

/** Raw first, because that is what needs doing; finished last and collapsed. */
const GROUP_ORDER: BatchState[] = ['raw', 'partiallyCooked', 'cooked', 'finished'];

type View =
  | { kind: 'list' }
  | { kind: 'batchForm'; batch?: Batch }
  | { kind: 'cookForm'; batch: Batch; session?: CookSession }
  | { kind: 'addIngredient'; typedName: string };

export function KitchenScreen({ today = new Date() }: { today?: Date }) {
  const { catalogue, refresh: refreshCatalogue } = useCatalogue();
  const { batches, sessions, samples, loading, storageError, refresh } = useKitchen();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [showFinished, setShowFinished] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<BatchState, Batch[]>(GROUP_ORDER.map((s) => [s, []]));
    // Newest purchase first within each group: the thing you just bought is
    // the thing you are most likely to be looking for.
    const ordered = [...batches].sort((a, b) => b.createdAt - a.createdAt);
    for (const b of ordered) out.get(batchState(b, sessions))!.push(b);
    return out;
  }, [batches, sessions]);

  const ingredientFor = (batch: Batch) =>
    catalogue.find((i) => i.id === batch.ingredientId) ?? null;

  const backToList = () => setView({ kind: 'list' });

  const afterChange = async () => {
    await refresh();
    backToList();
  };

  if (view.kind === 'addIngredient') {
    return (
      <section className="screen">
        <AddIngredientScreen
          initialName={view.typedName}
          onSaved={() => { void refreshCatalogue().then(() => setView({ kind: 'batchForm' })); }}
          onCancel={() => setView({ kind: 'batchForm' })}
        />
      </section>
    );
  }

  if (view.kind === 'batchForm') {
    return (
      <section className="screen">
        <AddBatchForm
          catalogue={catalogue}
          batch={view.batch}
          sessions={sessions}
          today={today}
          onSaved={() => { void afterChange(); }}
          onCancel={backToList}
          onAddNew={(typedName) => setView({ kind: 'addIngredient', typedName })}
        />
      </section>
    );
  }

  if (view.kind === 'cookForm') {
    const ingredient = ingredientFor(view.batch);
    if (ingredient === null) {
      // Cooking needs the ingredient's yield and retention figures.
      return (
        <section className="screen">
          <p role="alert">
            This batch's ingredient is no longer in your list, so a cook cannot be
            worked out for it.
          </p>
          <button type="button" className="btn btn--secondary" onClick={backToList}>Back</button>
        </section>
      );
    }
    return (
      <section className="screen">
        <CookSessionForm
          batch={view.batch}
          ingredient={ingredient}
          sessions={sessions}
          samples={samples}
          session={view.session}
          today={today}
          onSaved={() => { void afterChange(); }}
          onCancel={backToList}
        />
      </section>
    );
  }

  const visibleGroups = GROUP_ORDER.filter(
    (s) => (grouped.get(s)!.length > 0) && (s !== 'finished' || showFinished),
  );
  const finishedCount = grouped.get('finished')!.length;

  return (
    <section className="screen">
      <h2>Kitchen</h2>

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setView({ kind: 'batchForm' })}
        >
          Log a purchase
        </button>
      </div>

      {!loading && batches.length === 0 && storageError === null && (
        <p className="screen__hint" data-testid="kitchen-empty">
          Nothing in the kitchen yet. Log what you bought and this is where it
          lives until the last portion is eaten.
        </p>
      )}

      {visibleGroups.map((state) => (
        <div key={state} className="kitchen__group">
          <h3>{STATE_LABELS[state]}</h3>
          {grouped.get(state)!.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              ingredient={ingredientFor(b)}
              sessions={sessions}
              onChanged={() => { void refresh(); }}
              onCook={(batch) => setView({ kind: 'cookForm', batch })}
              onEditBatch={(batch) => setView({ kind: 'batchForm', batch })}
              onEditSession={(batch, session) => setView({ kind: 'cookForm', batch, session })}
            />
          ))}
        </div>
      ))}

      {finishedCount > 0 && !showFinished && (
        <button type="button" className="btn btn--secondary" onClick={() => setShowFinished(true)}>
          Show finished ({finishedCount})
        </button>
      )}

      {showFinished && finishedCount > 0 && (
        <button type="button" className="btn btn--secondary" onClick={() => setShowFinished(false)}>
          Hide finished
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/screens/KitchenScreen.test.tsx
```

Expected: PASS, 7 tests (after deleting the placeholder noted in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/KitchenScreen.tsx src/ui/screens/KitchenScreen.test.tsx
git commit -m "feat: add the Kitchen screen

Batches group by derived state, newest first, with finished batches collapsed
behind a count: a kitchen accumulates them forever and this is a phone screen.
The add-ingredient flow is reachable from the purchase form, so an unlisted
ingredient is never a dead end here either."
```

---

## Task 16: Feed the calculator the user's own yields

This is the task the whole phase exists for. `resolveYield`'s `measured` branch
has been unreachable since Phase 1 because nothing produced samples.

**Files:**
- Modify: `src/ui/screens/CalcScreen.tsx`
- Modify: `src/ui/screens/CalcScreen.test.tsx` (append)

**Interfaces:**
- Consumes: `useKitchen` from Task 8; `AddBatchForm` from Task 10
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Append to `src/ui/screens/CalcScreen.test.tsx`:

```tsx
describe('CalcScreen calibration', () => {
  beforeEach(async () => {
    await db.batches.clear();
    await db.cookSessions.clear();
  });

  it('uses the published factor while the user has no cooks logged', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('710g');
    });
    expect(screen.getByText(/published factor/i)).toBeInTheDocument();
  });

  it('switches to the user own measured average once a cook is logged', async () => {
    // One cook at 0.60 rather than the published 0.71.
    await db.batches.put({
      id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
      purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
      createdAt: 0,
    });
    await db.cookSessions.put({
      id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(1000),
      cookedWeightG: g(600), cookedRemainingG: g(600), cookedAt: '2026-09-19',
      portionCount: 4, excludeFromCalibration: false,
    });

    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('600g');
    });
    expect(screen.getByText(/your average across 1 cook/i)).toBeInTheDocument();
  });

  it('honours an excluded cook, falling back to the published factor', async () => {
    await db.batches.put({
      id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
      purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
      createdAt: 0,
    });
    await db.cookSessions.put({
      id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(1000),
      cookedWeightG: g(600), cookedRemainingG: g(600), cookedAt: '2026-09-19',
      portionCount: 4, excludeFromCalibration: true,
    });

    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('710g');
    });
  });

  it('offers to log the calculated weight as a batch', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();

    fireEvent.click(await screen.findByRole('button', { name: /log this as a batch/i }));

    // Prefilled from the calculator, so the user does not retype it.
    expect(screen.getByLabelText(/^raw weight/i)).toHaveValue(1000);
  });
});
```

Add to the existing imports at the top of `CalcScreen.test.tsx`:

```tsx
import { g, myr } from '../../core/units';
```

`selectChicken` is the helper already defined in this file (around line 47).
It picks chicken breast, enters 1000g and selects the roasted method, which is
exactly what these tests need. Reuse it rather than writing a new one, and note
why it drives the controls the way it does:

- The ingredient control is a typeahead combobox, not a `<select>`, so it is
  driven by focusing the input and dispatching `mousedown` on a listbox option.
  A plain `click` is swallowed by the input's blur closing the list first.
- The method control is found with `getByRole('combobox', { name: /method/i })`
  rather than `getByLabelText`, because `MethodCompare`'s `aria-label`
  ("Method comparison") also matches `/method/i` under `getByLabelText`'s
  aria-label fallback once a result is on screen.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/ui/screens/CalcScreen.test.tsx
```

Expected: FAIL — the measured test still reports 710g, and there is no
"log this as a batch" button.

- [ ] **Step 3: Wire the samples through**

In `src/ui/screens/CalcScreen.tsx`:

1. Add the imports:

```tsx
import { useKitchen } from '../useKitchen';
import { AddBatchForm } from '../components/AddBatchForm';
```

2. Inside the component, next to the existing `useCatalogue()` call:

```tsx
  // The point of Phase 2: resolveYield's `measured` branch has been
  // unreachable since Phase 1 because nothing produced samples.
  const { sessions, samples, refresh: refreshKitchen } = useKitchen();
  const [loggingBatch, setLoggingBatch] = useState(false);
  const [loggedMessage, setLoggedMessage] = useState<string | null>(null);
```

3. Replace all three `samples: []` / `[]` sample arguments — in the `result`
   memo (both `rawFromCooked` and `computeCooked`) and in the `rows` memo
   (`compareMethods`) — with `samples`, and add `samples` to each memo's
   dependency array:

```tsx
  const result = useMemo(() => {
    if (ingredient === null || weight <= 0) return null;
    const rawG = entered === 'raw'
      ? weight
      : rawFromCooked(ingredient, weight, method, samples, CATEGORY_YIELD).rawWeightG;
    const cooked = computeCooked({
      ingredient, rawG, method, samples, categoryYield: CATEGORY_YIELD, retention: RETENTION,
    });
    return { cooked, shownWeight: entered === 'raw' ? cooked.cookedWeightG : rawG };
  }, [ingredient, weight, entered, method, samples]);

  const rows = useMemo(
    () => (ingredient === null ? [] : compareMethods(ingredient, samples, CATEGORY_YIELD, RETENTION, HIGHLIGHT)),
    [ingredient, samples],
  );
```

4. Render the batch form when `loggingBatch` is set. Put this branch alongside
   the existing `addingIngredient` branch, before it in the same ternary chain:

```tsx
      {loggingBatch && ingredient !== null ? (
        <AddBatchForm
          catalogue={catalogue}
          sessions={sessions}
          initialIngredientId={ingredient.id}
          initialRawWeightG={result?.cooked.rawWeightG}
          onSaved={(batch) => {
            void (async () => {
              await refreshKitchen();
              setLoggingBatch(false);
              setLoggedMessage(
                `Logged ${formatG(batch.rawWeightG)} of ${ingredient.name.toLowerCase()} to your kitchen.`,
              );
            })();
          }}
          onCancel={() => setLoggingBatch(false)}
          onAddNew={handleAddNew}
        />
      ) : addingIngredient ? (
```

   Add `formatG` to the existing `../../core/units` import.

5. Inside the `result !== null` block, after the result card, add the action
   and its confirmation:

```tsx
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => { setLoggedMessage(null); setLoggingBatch(true); }}
                >
                  Log this as a batch
                </button>
              </div>

              {loggedMessage !== null && (
                <p className="banner banner--info" role="status">{loggedMessage}</p>
              )}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/ui/screens/CalcScreen.test.tsx
```

Expected: PASS — the existing CalcScreen tests plus the 4 new ones. The
existing tests assert published-factor results and must keep passing, because
an empty kitchen produces no samples.

- [ ] **Step 5: Confirm the golden suite is untouched**

```bash
npx vitest run src/core/golden.test.ts
```

Expected: PASS. The golden tests pass `samples: []` directly and never go
through the UI, so calibration cannot move them — this run is to prove it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/CalcScreen.tsx src/ui/screens/CalcScreen.test.tsx
git commit -m "feat: calibrate the calculator from the user's own cooks

resolveYield's measured branch has been unreachable since Phase 1 because
nothing produced samples. The calculator and the method comparison now read the
user's logged cooks, honouring exclusions, and offer to log a calculated weight
straight to the kitchen."
```

---

## Task 17: Turn the Kitchen tab on, and style it

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx` (append)
- Modify: `src/index.css` (append)

**Interfaces:**
- Consumes: `KitchenScreen` from Task 15
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Append to `src/ui/App.test.tsx`:

```tsx
describe('App Kitchen tab', () => {
  it('no longer marks Kitchen as a future phase', async () => {
    render(<App />);
    const tab = await screen.findByRole('tab', { name: /kitchen/i });
    expect(tab).toBeEnabled();
    expect(tab).not.toHaveTextContent(/phase 2/i);
  });

  it('opens the Kitchen screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /kitchen/i }));
    expect(await screen.findByRole('heading', { name: /^kitchen$/i })).toBeInTheDocument();
  });

  it('still marks Today and Costs as future phases', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: /today/i })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /costs/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npx vitest run src/ui/App.test.tsx
```

Expected: FAIL — the Kitchen tab is still disabled.

- [ ] **Step 3: Wire the tab**

In `src/ui/App.tsx`:

1. Import the screen:

```tsx
import { KitchenScreen } from './screens/KitchenScreen';
```

2. Drop the `phase` marker from the Kitchen row of `TABS`:

```tsx
const TABS: { id: Tab; label: string; phase?: number }[] = [
  { id: 'today', label: 'Today', phase: 3 },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs', phase: 4 },
  { id: 'profile', label: 'Profile' },
];
```

3. Add it to `BUILT`, and update the comment, which currently says "Phase 1":

```tsx
/** Tabs that actually exist. A stored preference for any other tab falls back to Calc. */
const BUILT: readonly Tab[] = ['kitchen', 'calc', 'profile'];
```

   Note `Settings.landingTab` is still typed `'today' | 'calc'`, so no stored
   preference can name the kitchen yet. Leave that alone — widening it is
   Phase 3's business, when Today exists and the choice is real.

4. Render it in `main`:

```tsx
        {tab === 'kitchen' && <KitchenScreen />}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/App.test.tsx
```

Expected: PASS, including the existing App tests.

- [ ] **Step 5: Add the styles**

Append to `src/index.css`, following the existing token and BEM conventions in
that file (read the top of it for the custom properties in use — do not
introduce new raw colour values where a token exists):

```css
/* --- Kitchen ------------------------------------------------------------ */

.kitchen__group {
  margin-block: var(--space-4, 1rem);
}

.kitchen__group h3 {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted, #6b7280);
}

.batch__state {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--color-surface-sunken, #f3f4f6);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.batch__remaining {
  font-weight: 600;
}

.batch__purchase,
.batch__cost,
.session__summary,
.session__cost {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
}

.batch__sessions {
  list-style: none;
  padding: 0;
  margin: 0;
}

.session {
  padding-block: var(--space-3, 0.75rem);
  border-top: 1px solid var(--color-border, #e5e7eb);
}

/* Advisory, not an error: a flag must read as "worth a look", never as a
   failure, because the cook it describes is kept either way. */
.flag {
  padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
  border-radius: var(--radius-2, 0.5rem);
  font-size: 0.875rem;
  background: var(--color-warn-surface, #fef3c7);
  color: var(--color-warn-text, #92400e);
}

.flag--implausible {
  background: var(--color-danger-surface, #fee2e2);
  color: var(--color-danger-text, #991b1b);
}

.eat__remaining {
  font-weight: 600;
}

.yield-badge {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #6b7280);
}

/* A category fallback is a rough estimate, and the parent spec is explicit
   that the app must never display precision it does not have. */
.yield-badge--categoryDefault {
  font-style: italic;
}
```

- [ ] **Step 6: Check the styling in a browser at phone width**

```bash
npm run dev
```

Open the Kitchen tab at 390px wide and confirm: tap targets are reachable with
one thumb, nothing scrolls horizontally, and a batch card with two cooks is
still readable. Fix any token names that did not exist by reading the real ones
out of the top of `src/index.css`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/App.tsx src/ui/App.test.tsx src/index.css
git commit -m "feat: turn on the Kitchen tab

landingTab stays typed 'today' | 'calc': widening it belongs with Phase 3, when
Today exists and the choice is a real one."
```

---

## Task 18: Whole-branch verification

No new behaviour. This task exists because the phase's claim — that the
calculator now reads the user's own kitchen — is only worth as much as the
evidence behind it.

**Files:** none created or modified unless a check fails.

- [ ] **Step 1: Run the full suite**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"
npm test
```

Expected: every test passes. The baseline was 24 files / 285 tests; this phase
adds roughly 13 files and 130 tests. Record the real numbers — do not assert
them from this plan.

- [ ] **Step 2: Run the type build and the linter**

```bash
npm run build && npm run lint
```

Expected: `tsc -b` silent, Vite build clean, `oxlint` exits 0. One pre-existing
warning in `src/ui/components/WeightInput.tsx:23` is expected and in scope for
nobody. Any *new* warning is this phase's to fix.

- [ ] **Step 3: Confirm the golden-value suite still holds**

```bash
npx vitest run src/core/golden.test.ts src/core/nutrition.test.ts src/core/yieldResolver.test.ts
```

Expected: PASS. These are the regression net against silently wrong numbers,
and this phase changed what feeds `resolveYield`. If any golden case moved, the
cause is a bug in this phase, not a stale expectation — do not adjust the
expected values.

- [ ] **Step 4: Verify core purity**

```bash
grep -rn "from '\.\./ui\|from '\.\./storage\|from 'react'" src/core/ && echo "IMPURE" || echo "core is clean"
```

Expected: `core is clean`. The purity of `src/core/` is what makes the golden
tests possible; a single import from `storage` or `react` forfeits that.

- [ ] **Step 5: Walk the lifecycle by hand**

```bash
npm run dev
```

At phone width, in one sitting:

1. Log a purchase: 1kg chicken breast, RM20, a location, today's date.
2. Confirm the card shows `Raw`, `1,000g raw left`, `RM20.00/kg raw` and a
   protein-per-RM figure.
3. Cook 400g of it, roasted, cooked weight 284g, 4 portions.
4. Confirm the state moved to `Part cooked`, `600g raw left`, and that no
   outlier flag appears (284/400 = 0.71, exactly the published factor).
5. Eat one portion, then eat a weighed 50g. Confirm the remaining grams and the
   fractional portion count both follow.
6. Open **Calc**, choose chicken breast, 1000g, roasted. Confirm the trace now
   reads *"your average across 1 cook"* and the cooked weight reflects 0.71
   from your own cook rather than the published figure.
7. Tick *ignore this cook*, return to Calc, and confirm it reverts to the
   published factor.
8. Edit the cook's cooked weight to 2840g. Confirm it is refused, naming the
   typical yield.
9. Delete the batch. Confirm the confirmation names the cook and the cooked
   food, and that Calc reverts to the published factor afterwards.

- [ ] **Step 6: Write the execution record**

Create `docs/superpowers/2026-09-19-phase-2-execution-record.md`, following the
shape of `docs/superpowers/2026-09-17-phase-1-execution-record.md`: every
ruling made during execution, every place this plan was found wrong, and the
evidence that overrode it. Phase 3 will read it before trusting this plan.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/2026-09-19-phase-2-execution-record.md
git commit -m "docs: add the Phase 2 execution record"
```

- [ ] **Step 8: Hand back**

Report the real test count, the build result, and anything left undone. Then
invoke `superpowers:finishing-a-development-branch` to decide how
`phase-2-kitchen` is integrated.
