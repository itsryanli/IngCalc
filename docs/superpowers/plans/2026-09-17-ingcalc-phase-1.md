# IngCalc Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working offline calculator that converts raw ingredient weight to cooked weight, reports nutrients against a person's computed daily targets, and ranks cooking methods by what they retain.

**Architecture:** A pure-function calculation core (`src/core/`) with no React and no storage imports, sitting under static reference data (`src/data/`) and a thin React UI (`src/ui/`). Purity in the core is what makes the golden-value regression tests possible, and those tests are the main defence against silently wrong numbers. Storage is Dexie/IndexedDB, introduced in Phase 1 only for profiles, settings and user-added ingredients; batches and cook sessions arrive in Phase 2 without a schema rewrite.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 5, Vitest, Dexie 4, `vite-plugin-pwa`.

**Spec:** `docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **All weights are stored and computed in grams.** Kilograms exist only as an input/display convenience, converted at the UI edge. Never store kg.
- **All nutrient profiles are per 100g of RAW ingredient.** Cooked values are always derived, never stored.
- **Nutrient units:** `kcal` for energy; grams for `protein`, `carbs`, `fibre`, `fat`; milligrams for `potassium`, `iron`, `magnesium`, `zinc`, `calcium`, `sodium`.
- **Branded types:** `Grams` and `MYR` are branded numbers. Construct only via `g()` / `myr()`. Never cast raw numbers.
- **`src/core/**` must not import from `src/ui/**`, `src/data/**` or `dexie`.** Core functions take data as parameters. This is enforced by a test in Task 2.
- **Every bundled reference number carries a `sourceRef`.** Values entered from memory are a defect; each must be checked against its cited source at entry time.
- **The UI must never display a derived number without its provenance** — `measured`, `published` or `categoryDefault`. A number whose origin is unstated is a bug.
- **Micronutrients always show both percentages**, RNI and DV, side by side.
- **TypeScript `strict: true`.** No `any`, no non-null assertions in `src/core/**`.
- **TDD throughout:** write the failing test, run it and watch it fail, write the minimal implementation, run it and watch it pass, commit.

---

## File Structure

```
src/
  core/                    # pure: no React, no Dexie, no I/O
    units.ts               # branded Grams/MYR + conversions
    types.ts               # domain types shared across core
    nutrients.ts           # NutrientProfile arithmetic
    yieldResolver.ts       # resolveYield(): measured → published → category
    retention.ts           # retentionFor() lookup with documented fallback
    nutrition.ts           # computeCooked/computeRaw/rawFromCooked + CalcStep trace
    targets.ts             # BMR, TDEE, calorie/protein/micro targets
    methodCompare.ts       # ranked cooking-method comparison
  data/                    # static bundled tables, no logic
    ingredients.ts
    categoryYield.ts
    retentionTable.ts
    rniMY.ts
    dvUS.ts
  storage/
    db.ts                  # Dexie schema v1 + availability probe
    profiles.ts            # profile CRUD
    settings.ts            # settings read/write
    userIngredients.ts     # user-added ingredient CRUD
  ui/
    App.tsx                # shell + tab bar
    screens/CalcScreen.tsx
    screens/ProfileScreen.tsx
    screens/AddIngredientScreen.tsx
    components/CalcTrace.tsx        # renders CalcStep[]
    components/NutrientTable.tsx    # amount + %RNI + %DV
    components/MethodCompare.tsx
    components/WeightInput.tsx      # g/kg toggle, converts at the edge
```

Files that change together live together: the calculation core is split by responsibility rather than by layer, so a change to how yield resolves touches one file and its test.

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run dev`

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/ryanli/Desktop/IngCalc
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
npm install dexie dexie-react-hooks
```

If `npm create vite` refuses because the directory is not empty, answer "Ignore files and continue" — `docs/`, `.gitignore` and `Proposed roadmap.rtf` must be preserved.

- [ ] **Step 2: Configure Vitest**

Replace `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

Create `src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Enable strict TypeScript**

In `tsconfig.json`, under `compilerOptions`, ensure:

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true
```

`noUncheckedIndexedAccess` matters here: the reference tables are keyed lookups, and it forces every table access to handle the missing case explicitly rather than returning `undefined` into arithmetic.

- [ ] **Step 4: Write the smoke test**

```ts
// src/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript with Vitest"
```

---

## Task 2: Branded units and conversions

**Files:**
- Create: `src/core/units.ts`
- Test: `src/core/units.test.ts`, `src/core/purity.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Grams = number & { readonly __brand: 'Grams' }`
  - `type MYR = number & { readonly __brand: 'MYR' }`
  - `g(n: number): Grams` — throws `RangeError` on negative or non-finite
  - `myr(n: number): MYR` — throws `RangeError` on negative or non-finite
  - `kgToG(kg: number): Grams`
  - `gToKg(v: Grams): number`
  - `addG(a: Grams, b: Grams): Grams`
  - `subG(a: Grams, b: Grams): Grams` — throws `RangeError` if result would be negative

- [ ] **Step 1: Write the failing test**

```ts
// src/core/units.test.ts
import { describe, it, expect } from 'vitest';
import { g, myr, kgToG, gToKg, addG, subG } from './units';

describe('units', () => {
  it('constructs grams from a valid number', () => {
    expect(g(250)).toBe(250);
  });

  it('rejects negative and non-finite grams', () => {
    expect(() => g(-1)).toThrow(RangeError);
    expect(() => g(NaN)).toThrow(RangeError);
    expect(() => g(Infinity)).toThrow(RangeError);
  });

  it('rejects negative and non-finite money', () => {
    expect(() => myr(-0.5)).toThrow(RangeError);
    expect(() => myr(NaN)).toThrow(RangeError);
  });

  it('converts kilograms to grams', () => {
    expect(kgToG(1.5)).toBe(1500);
  });

  it('round-trips g -> kg -> g without drift', () => {
    for (const n of [1, 100, 250, 999, 1000, 1234.5, 100000]) {
      expect(gToKg(kgToG(n / 1000))).toBeCloseTo(n / 1000, 9);
      expect(kgToG(gToKg(g(n)))).toBeCloseTo(n, 9);
    }
  });

  it('adds and subtracts grams', () => {
    expect(addG(g(300), g(200))).toBe(500);
    expect(subG(g(300), g(200))).toBe(100);
  });

  it('refuses to subtract into a negative weight', () => {
    expect(() => subG(g(200), g(300))).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/units.test.ts`
Expected: FAIL — cannot resolve `./units`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/units.ts

export type Grams = number & { readonly __brand: 'Grams' };
export type MYR = number & { readonly __brand: 'MYR' };

function checkNonNegative(n: number, label: string): void {
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be finite, got ${n}`);
  if (n < 0) throw new RangeError(`${label} must not be negative, got ${n}`);
}

export function g(n: number): Grams {
  checkNonNegative(n, 'Weight in grams');
  return n as Grams;
}

export function myr(n: number): MYR {
  checkNonNegative(n, 'Price in MYR');
  return n as MYR;
}

export const kgToG = (kg: number): Grams => g(kg * 1000);
export const gToKg = (v: Grams): number => v / 1000;

export const addG = (a: Grams, b: Grams): Grams => g(a + b);
export const subG = (a: Grams, b: Grams): Grams => g(a - b);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/units.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the core-purity guard test**

This enforces the global constraint mechanically rather than by discipline.

```ts
// src/core/purity.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CORE = join(process.cwd(), 'src/core');
const FORBIDDEN = [/from ['"]dexie/, /from ['"].*\/ui\//, /from ['"].*\/data\//, /from ['"]react/];

describe('core purity', () => {
  it('has no imports from ui, data, react or dexie', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(CORE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(CORE, file), 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(src)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the purity test**

Run: `npx vitest run src/core/purity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/units.ts src/core/units.test.ts src/core/purity.test.ts
git commit -m "feat: add branded gram and MYR units with a core-purity guard"
```

---

## Task 3: Domain types and nutrient arithmetic

**Files:**
- Create: `src/core/types.ts`, `src/core/nutrients.ts`
- Test: `src/core/nutrients.test.ts`

**Interfaces:**
- Consumes: `Grams`, `g` from `./units`
- Produces:
  - `NUTRIENT_KEYS` (readonly tuple), `type NutrientKey`, `type NutrientProfile = Record<NutrientKey, number>`
  - `type Category`, `type CookMethod`, `COOK_METHODS`
  - `interface Ingredient`, `interface Profile`
  - `zeroNutrients(): NutrientProfile`
  - `scaleNutrients(p: NutrientProfile, factor: number): NutrientProfile`
  - `nutrientsForWeight(per100g: NutrientProfile, weight: Grams): NutrientProfile`
  - `addNutrients(a: NutrientProfile, b: NutrientProfile): NutrientProfile`
  - `mapNutrients(p, fn: (value: number, key: NutrientKey) => number): NutrientProfile`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/nutrients.test.ts
import { describe, it, expect } from 'vitest';
import { g } from './units';
import {
  zeroNutrients, scaleNutrients, nutrientsForWeight, addNutrients, mapNutrients,
} from './nutrients';
import { NUTRIENT_KEYS } from './types';

const sample = { ...zeroNutrients(), kcal: 120, protein: 22.5, potassium: 334 };

describe('nutrients', () => {
  it('creates a zero profile containing every key', () => {
    const z = zeroNutrients();
    expect(Object.keys(z).sort()).toEqual([...NUTRIENT_KEYS].sort());
    expect(Object.values(z).every((v) => v === 0)).toBe(true);
  });

  it('scales every nutrient by a factor', () => {
    const r = scaleNutrients(sample, 2);
    expect(r.kcal).toBe(240);
    expect(r.protein).toBe(45);
    expect(r.potassium).toBe(668);
  });

  it('converts a per-100g profile to an absolute weight', () => {
    const r = nutrientsForWeight(sample, g(250));
    expect(r.kcal).toBeCloseTo(300, 6);
    expect(r.protein).toBeCloseTo(56.25, 6);
  });

  it('returns zeros for zero weight', () => {
    const r = nutrientsForWeight(sample, g(0));
    expect(r.protein).toBe(0);
  });

  it('adds two profiles key by key', () => {
    const r = addNutrients(sample, sample);
    expect(r.protein).toBe(45);
    expect(r.fibre).toBe(0);
  });

  it('maps each nutrient with access to its key', () => {
    const r = mapNutrients(sample, (v, k) => (k === 'protein' ? v * 10 : v));
    expect(r.protein).toBe(225);
    expect(r.kcal).toBe(120);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/nutrients.test.ts`
Expected: FAIL — cannot resolve `./nutrients`.

- [ ] **Step 3: Write the types**

```ts
// src/core/types.ts
import type { Grams } from './units';

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'carbs', 'fibre', 'fat',
  'potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientProfile = Record<NutrientKey, number>;

export const CATEGORIES = [
  'vegetable', 'meat', 'seafood', 'fruit', 'grain',
  'legume', 'dairy', 'egg', 'nut', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const COOK_METHODS = [
  'boiled', 'steamed', 'panFried', 'stirFried', 'deepFried', 'roasted', 'grilled',
] as const;
export type CookMethod = (typeof COOK_METHODS)[number];

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  per100gRaw: NutrientProfile;
  publishedYield: Partial<Record<CookMethod, number>>;
  /** Rice, pasta and dried legumes absorb water: a yield above 1 is correct, not an error. */
  absorbsWater: boolean;
  source: 'usda' | 'user';
  sourceRef?: string;
  archived: boolean;
}

export type Sex = 'male' | 'female';
export type Goal = 'cut' | 'maintain' | 'bulk';

export interface Profile {
  id: string;
  name: string;
  /** An input to the Mifflin-St Jeor formula, which has two variants. */
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  sessionsPerWeek: number;
  goal: Goal;
  proteinGPerKg?: number;
}

export interface YieldSample {
  ingredientId: string;
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
  excludeFromCalibration: boolean;
}
```

`YieldSample` deliberately does not reference `CookSession`. Phase 2 maps its cook sessions onto this shape, which keeps the core independent of the storage entity.

- [ ] **Step 4: Write the nutrient arithmetic**

```ts
// src/core/nutrients.ts
import { NUTRIENT_KEYS, type NutrientKey, type NutrientProfile } from './types';
import type { Grams } from './units';

export function zeroNutrients(): NutrientProfile {
  const out = {} as NutrientProfile;
  for (const k of NUTRIENT_KEYS) out[k] = 0;
  return out;
}

export function mapNutrients(
  p: NutrientProfile,
  fn: (value: number, key: NutrientKey) => number,
): NutrientProfile {
  const out = {} as NutrientProfile;
  for (const k of NUTRIENT_KEYS) out[k] = fn(p[k], k);
  return out;
}

export const scaleNutrients = (p: NutrientProfile, factor: number): NutrientProfile =>
  mapNutrients(p, (v) => v * factor);

export const nutrientsForWeight = (per100g: NutrientProfile, weight: Grams): NutrientProfile =>
  scaleNutrients(per100g, weight / 100);

export const addNutrients = (a: NutrientProfile, b: NutrientProfile): NutrientProfile =>
  mapNutrients(a, (v, k) => v + b[k]);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/nutrients.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/nutrients.ts src/core/nutrients.test.ts
git commit -m "feat: add domain types and nutrient profile arithmetic"
```

---

## Task 4: Category yield fallback table

**Files:**
- Create: `src/data/categoryYield.ts`
- Test: `src/data/categoryYield.test.ts`

**Interfaces:**
- Consumes: `Category`, `CookMethod`, `CATEGORIES`, `COOK_METHODS` from `src/core/types`
- Produces: `CATEGORY_YIELD: Record<Category, Record<CookMethod, number>>` — **total**, every category × method pair populated

This table must be total because `resolveYield` (Task 6) treats it as the last resort and must never return `undefined` into arithmetic. The totality test below is what guarantees that.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/categoryYield.test.ts
import { describe, it, expect } from 'vitest';
import { CATEGORIES, COOK_METHODS } from '../core/types';
import { CATEGORY_YIELD } from './categoryYield';

describe('CATEGORY_YIELD', () => {
  it('covers every category and method pair', () => {
    for (const c of CATEGORIES) {
      for (const m of COOK_METHODS) {
        const v = CATEGORY_YIELD[c][m];
        expect(typeof v, `${c}.${m}`).toBe('number');
      }
    }
  });

  it('keeps every factor within a plausible range', () => {
    for (const c of CATEGORIES) {
      for (const m of COOK_METHODS) {
        const v = CATEGORY_YIELD[c][m];
        expect(v, `${c}.${m}`).toBeGreaterThan(0.3);
        expect(v, `${c}.${m}`).toBeLessThanOrEqual(3.5);
      }
    }
  });

  it('expects grains to gain weight when boiled or steamed', () => {
    expect(CATEGORY_YIELD.grain.boiled).toBeGreaterThan(1);
    expect(CATEGORY_YIELD.grain.steamed).toBeGreaterThan(1);
  });

  it('expects meat to lose weight under dry heat', () => {
    expect(CATEGORY_YIELD.meat.roasted).toBeLessThan(1);
    expect(CATEGORY_YIELD.meat.grilled).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/categoryYield.test.ts`
Expected: FAIL — cannot resolve `./categoryYield`.

- [ ] **Step 3: Write the table**

These are category averages used only when an ingredient has no published factor for a method. Derive them from USDA Agriculture Handbook 102 ("Food Yields Summarized by Different Stages of Preparation") and record the handbook in the file header. Verify each row against the handbook rather than accepting the starting values below unchecked.

```ts
// src/data/categoryYield.ts
// Category-average cooking yields, used ONLY as a last-resort fallback when an
// ingredient has no published factor for a method.
// Source: USDA Agriculture Handbook 102, Food Yields Summarized by Different
// Stages of Preparation. Values are category means and are labelled
// 'categoryDefault' in the UI so the user knows they are rough.
import type { Category, CookMethod } from '../core/types';

export const CATEGORY_YIELD: Record<Category, Record<CookMethod, number>> = {
  meat:      { boiled: 0.70, steamed: 0.75, panFried: 0.72, stirFried: 0.73, deepFried: 0.78, roasted: 0.73, grilled: 0.71 },
  seafood:   { boiled: 0.78, steamed: 0.82, panFried: 0.78, stirFried: 0.80, deepFried: 0.83, roasted: 0.79, grilled: 0.77 },
  egg:       { boiled: 1.00, steamed: 0.98, panFried: 0.88, stirFried: 0.88, deepFried: 0.90, roasted: 0.92, grilled: 0.90 },
  vegetable: { boiled: 0.90, steamed: 0.92, panFried: 0.80, stirFried: 0.78, deepFried: 0.72, roasted: 0.75, grilled: 0.74 },
  fruit:     { boiled: 0.90, steamed: 0.92, panFried: 0.82, stirFried: 0.82, deepFried: 0.75, roasted: 0.78, grilled: 0.77 },
  grain:     { boiled: 2.60, steamed: 2.40, panFried: 1.00, stirFried: 1.00, deepFried: 0.95, roasted: 0.95, grilled: 0.95 },
  legume:    { boiled: 2.20, steamed: 2.00, panFried: 0.92, stirFried: 0.92, deepFried: 0.88, roasted: 0.90, grilled: 0.90 },
  dairy:     { boiled: 0.95, steamed: 0.95, panFried: 0.90, stirFried: 0.90, deepFried: 0.90, roasted: 0.90, grilled: 0.90 },
  nut:       { boiled: 1.10, steamed: 1.10, panFried: 0.96, stirFried: 0.96, deepFried: 0.94, roasted: 0.95, grilled: 0.95 },
  other:     { boiled: 0.90, steamed: 0.92, panFried: 0.85, stirFried: 0.85, deepFried: 0.82, roasted: 0.85, grilled: 0.85 },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/categoryYield.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/categoryYield.ts src/data/categoryYield.test.ts
git commit -m "feat: add total category yield fallback table"
```

---

## Task 5: Nutrient retention table and lookup

**Files:**
- Create: `src/data/retentionTable.ts`, `src/core/retention.ts`
- Test: `src/core/retention.test.ts`

**Interfaces:**
- Consumes: `Category`, `CookMethod`, `NutrientKey` from `src/core/types`
- Produces:
  - `RETENTION: Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>` (in `src/data/retentionTable.ts`)
  - `retentionFor(table, category, method, nutrient): { factor: number; assumed: boolean }` (in `src/core/retention.ts`) — returns `{ factor: 1, assumed: true }` when the table has no entry

This is the second of the two losses in the spec: leaching, distinct from water loss. `assumed: true` propagates to the UI as "assumed 100% retention", satisfying the global constraint that no number appears without provenance.

`retentionFor` takes the table as a parameter rather than importing it, because `src/core/**` may not import from `src/data/**`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/retention.test.ts
import { describe, it, expect } from 'vitest';
import { retentionFor } from './retention';
import { RETENTION } from '../data/retentionTable';

describe('retentionFor', () => {
  it('returns the table value when present', () => {
    const r = retentionFor(RETENTION, 'vegetable', 'boiled', 'potassium');
    expect(r.assumed).toBe(false);
    expect(r.factor).toBeGreaterThan(0);
    expect(r.factor).toBeLessThan(1);
  });

  it('assumes full retention when the nutrient is absent, and says so', () => {
    const r = retentionFor({}, 'vegetable', 'boiled', 'potassium');
    expect(r).toEqual({ factor: 1, assumed: true });
  });

  it('never retains energy above 100%', () => {
    const r = retentionFor(RETENTION, 'meat', 'roasted', 'kcal');
    expect(r.factor).toBeLessThanOrEqual(1);
  });

  it('loses more potassium boiling vegetables than steaming them', () => {
    const boiled = retentionFor(RETENTION, 'vegetable', 'boiled', 'potassium');
    const steamed = retentionFor(RETENTION, 'vegetable', 'steamed', 'potassium');
    expect(boiled.factor).toBeLessThan(steamed.factor);
  });

  it('keeps every tabled factor between 0 and 1', () => {
    for (const [cat, methods] of Object.entries(RETENTION)) {
      for (const [method, nutrients] of Object.entries(methods ?? {})) {
        for (const [key, value] of Object.entries(nutrients ?? {})) {
          expect(value, `${cat}.${method}.${key}`).toBeGreaterThan(0);
          expect(value, `${cat}.${method}.${key}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/retention.test.ts`
Expected: FAIL — cannot resolve `./retention`.

- [ ] **Step 3: Write the retention table**

Source these from the USDA Table of Nutrient Retention Factors, Release 6. Where that publication gives a figure for a category/method/nutrient, use it and keep the citation in the header. Where it does not, omit the entry entirely rather than inventing one — the omission surfaces honestly as "assumed 100%".

Macronutrients are close to fully retained (the mass that leaves is water, handled by the yield factor); minerals leach, and leach most in boiling where the water is discarded.

```ts
// src/data/retentionTable.ts
// Nutrient retention factors: the fraction of a nutrient's MASS that survives
// cooking. This is leaching, and is separate from water loss (the yield factor).
// Source: USDA Table of Nutrient Retention Factors, Release 6.
// Entries are omitted rather than guessed; a missing entry is reported to the
// user as "assumed 100% retention".
import type { Category, CookMethod, NutrientKey } from '../core/types';

export type RetentionTable = Partial<
  Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>
>;

const MINERALS_BOILED = { potassium: 0.72, magnesium: 0.76, calcium: 0.85, iron: 0.85, zinc: 0.85, sodium: 0.60 };
const MINERALS_STEAMED = { potassium: 0.92, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.90 };
const MINERALS_DRY = { potassium: 0.90, magnesium: 0.92, calcium: 0.95, iron: 0.95, zinc: 0.95, sodium: 0.95 };
const MACROS_INTACT = { protein: 1, carbs: 1, fibre: 1, fat: 1, kcal: 1 };
const MACROS_DRIP = { protein: 0.98, carbs: 1, fibre: 1, fat: 0.85, kcal: 0.95 };

export const RETENTION: RetentionTable = {
  vegetable: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    stirFried: { ...MACROS_INTACT, ...MINERALS_DRY, potassium: 0.90 },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    roasted:   { ...MACROS_INTACT, ...MINERALS_DRY },
    grilled:   { ...MACROS_INTACT, ...MINERALS_DRY },
    deepFried: { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  fruit: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_INTACT, ...MINERALS_DRY },
    grilled:   { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  meat: {
    boiled:    { ...MACROS_DRIP, ...MINERALS_BOILED },
    steamed:   { ...MACROS_DRIP, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_DRIP, ...MINERALS_DRY },
    grilled:   { ...MACROS_DRIP, ...MINERALS_DRY },
    panFried:  { ...MACROS_DRIP, ...MINERALS_DRY },
    stirFried: { ...MACROS_DRIP, ...MINERALS_DRY },
    deepFried: { ...MACROS_DRIP, ...MINERALS_DRY },
  },
  seafood: {
    boiled:    { ...MACROS_DRIP, ...MINERALS_BOILED },
    steamed:   { ...MACROS_DRIP, ...MINERALS_STEAMED },
    roasted:   { ...MACROS_DRIP, ...MINERALS_DRY },
    grilled:   { ...MACROS_DRIP, ...MINERALS_DRY },
    panFried:  { ...MACROS_DRIP, ...MINERALS_DRY },
    stirFried: { ...MACROS_DRIP, ...MINERALS_DRY },
    deepFried: { ...MACROS_DRIP, ...MINERALS_DRY },
  },
  legume: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    stirFried: { ...MACROS_INTACT, ...MINERALS_DRY },
    deepFried: { ...MACROS_INTACT, ...MINERALS_DRY },
  },
  grain: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_BOILED, potassium: 0.80 },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
  egg: {
    boiled:    { ...MACROS_INTACT, ...MINERALS_STEAMED },
    panFried:  { ...MACROS_INTACT, ...MINERALS_DRY },
    steamed:   { ...MACROS_INTACT, ...MINERALS_STEAMED },
  },
};
```

- [ ] **Step 4: Write the lookup**

```ts
// src/core/retention.ts
import type { Category, CookMethod, NutrientKey } from './types';

export type RetentionLookup = Partial<
  Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>
>;

export interface Retention {
  factor: number;
  /** True when no sourced figure exists and full retention was assumed. */
  assumed: boolean;
}

export function retentionFor(
  table: RetentionLookup,
  category: Category,
  method: CookMethod,
  nutrient: NutrientKey,
): Retention {
  const value = table[category]?.[method]?.[nutrient];
  return value === undefined ? { factor: 1, assumed: true } : { factor: value, assumed: false };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/retention.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/retentionTable.ts src/core/retention.ts src/core/retention.test.ts
git commit -m "feat: add nutrient retention table and lookup with honest fallback"
```

---

## Task 6: Yield resolver

**Files:**
- Create: `src/core/yieldResolver.ts`
- Test: `src/core/yieldResolver.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `CookMethod`, `Category`, `YieldSample` from `./types`; `Grams` from `./units`
- Produces:
  - `type YieldSource = 'measured' | 'published' | 'categoryDefault'`
  - `interface ResolvedYield { factor: number; source: YieldSource; sampleCount: number }`
  - `resolveYield(ingredient: Ingredient, method: CookMethod, samples: readonly YieldSample[], categoryYield: Record<Category, Record<CookMethod, number>>): ResolvedYield`

Resolution order: the mean of the user's own samples for that ingredient and method (excluding flagged ones and any with zero raw weight); else the ingredient's published factor; else the category default. `categoryYield` is passed in rather than imported, per the core-purity constraint.

No samples exist in Phase 1 — nothing produces them until Phase 2 — but the branch is built and tested now so Phase 2 only has to supply data.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/yieldResolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveYield } from './yieldResolver';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient, YieldSample } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';

const chicken: Ingredient = {
  id: 'chicken-breast',
  name: 'Chicken breast',
  category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5 },
  publishedYield: { roasted: 0.75 },
  absorbsWater: false,
  source: 'usda',
  sourceRef: 'FDC 171077',
  archived: false,
};

const sample = (over: Partial<YieldSample> = {}): YieldSample => ({
  ingredientId: 'chicken-breast',
  method: 'roasted',
  rawUsedG: g(1000),
  cookedWeightG: g(740),
  excludeFromCalibration: false,
  ...over,
});

describe('resolveYield', () => {
  it('uses the published factor when there are no samples', () => {
    expect(resolveYield(chicken, 'roasted', [], CATEGORY_YIELD))
      .toEqual({ factor: 0.75, source: 'published', sampleCount: 0 });
  });

  it('falls back to the category default when the method is unpublished', () => {
    const r = resolveYield(chicken, 'boiled', [], CATEGORY_YIELD);
    expect(r.source).toBe('categoryDefault');
    expect(r.factor).toBe(CATEGORY_YIELD.meat.boiled);
    expect(r.sampleCount).toBe(0);
  });

  it('prefers the mean of the user samples over the published factor', () => {
    const samples = [sample(), sample({ cookedWeightG: g(700) })];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD))
      .toEqual({ factor: 0.72, source: 'measured', sampleCount: 2 });
  });

  it('ignores samples for other ingredients or other methods', () => {
    const samples = [
      sample({ ingredientId: 'beef-sirloin' }),
      sample({ method: 'grilled' }),
    ];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD).source).toBe('published');
  });

  it('ignores samples excluded from calibration', () => {
    const samples = [sample({ excludeFromCalibration: true })];
    expect(resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD).source).toBe('published');
  });

  it('ignores samples with zero raw weight rather than dividing by zero', () => {
    const samples = [sample({ rawUsedG: g(0) })];
    const r = resolveYield(chicken, 'roasted', samples, CATEGORY_YIELD);
    expect(r.source).toBe('published');
    expect(Number.isFinite(r.factor)).toBe(true);
  });

  it('handles a water-absorbing ingredient whose measured yield exceeds 1', () => {
    const rice: Ingredient = {
      ...chicken, id: 'white-rice', name: 'White rice',
      category: 'grain', publishedYield: {}, absorbsWater: true,
    };
    const samples = [sample({ ingredientId: 'white-rice', method: 'boiled', rawUsedG: g(100), cookedWeightG: g(280) })];
    expect(resolveYield(rice, 'boiled', samples, CATEGORY_YIELD))
      .toEqual({ factor: 2.8, source: 'measured', sampleCount: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/yieldResolver.test.ts`
Expected: FAIL — cannot resolve `./yieldResolver`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/yieldResolver.ts
import type { Category, CookMethod, Ingredient, YieldSample } from './types';

export type YieldSource = 'measured' | 'published' | 'categoryDefault';

export interface ResolvedYield {
  factor: number;
  source: YieldSource;
  /** Number of the user's own cooks behind a 'measured' factor; 0 otherwise. */
  sampleCount: number;
}

export type CategoryYield = Record<Category, Record<CookMethod, number>>;

export function resolveYield(
  ingredient: Ingredient,
  method: CookMethod,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
): ResolvedYield {
  const usable = samples.filter(
    (s) =>
      s.ingredientId === ingredient.id &&
      s.method === method &&
      !s.excludeFromCalibration &&
      s.rawUsedG > 0,
  );

  if (usable.length > 0) {
    const mean = usable.reduce((sum, s) => sum + s.cookedWeightG / s.rawUsedG, 0) / usable.length;
    return { factor: mean, source: 'measured', sampleCount: usable.length };
  }

  const published = ingredient.publishedYield[method];
  if (published !== undefined) {
    return { factor: published, source: 'published', sampleCount: 0 };
  }

  return { factor: categoryYield[ingredient.category][method], source: 'categoryDefault', sampleCount: 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/yieldResolver.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/yieldResolver.ts src/core/yieldResolver.test.ts
git commit -m "feat: add yield resolver with measured/published/category precedence"
```

---

## Task 7: Nutrition engine with calculation trace

**Files:**
- Create: `src/core/nutrition.ts`
- Test: `src/core/nutrition.test.ts`

**Interfaces:**
- Consumes: `resolveYield`, `ResolvedYield`, `CategoryYield` from `./yieldResolver`; `retentionFor`, `RetentionLookup` from `./retention`; `nutrientsForWeight`, `scaleNutrients`, `mapNutrients` from `./nutrients`; `g`, `Grams` from `./units`
- Produces:
  - `interface CalcStep { label: string; detail: string; value: string; sourceNote?: string }`
  - `interface CookedResult { rawWeightG, cookedWeightG, yieldUsed, totals, per100gCooked, assumedRetentionFor: NutrientKey[], steps }`
  - `computeRaw(ingredient, rawG): { totals: NutrientProfile; steps: CalcStep[] }`
  - `computeCooked(input: CookInput): CookedResult`
  - `rawFromCooked(ingredient, cookedG, method, samples, categoryYield): { rawWeightG: Grams; yieldUsed: ResolvedYield }`

`steps` is a product requirement, not a debugging aid: the spec requires the app to show how it reached the number.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/nutrition.test.ts
import { describe, it, expect } from 'vitest';
import { computeCooked, computeRaw, rawFromCooked } from './nutrition';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const chicken: Ingredient = {
  id: 'chicken-breast',
  name: 'Chicken breast',
  category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5, fat: 2.6, potassium: 334 },
  publishedYield: { roasted: 0.75 },
  absorbsWater: false,
  source: 'usda',
  sourceRef: 'FDC 171077',
  archived: false,
};

const input = {
  ingredient: chicken,
  rawG: g(1000),
  method: 'roasted' as const,
  samples: [],
  categoryYield: CATEGORY_YIELD,
  retention: RETENTION,
};

describe('computeRaw', () => {
  it('scales the per-100g profile to the given weight', () => {
    const r = computeRaw(chicken, g(250));
    expect(r.totals.protein).toBeCloseTo(56.25, 6);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

describe('computeCooked', () => {
  it('applies the yield factor to the weight', () => {
    expect(computeCooked(input).cookedWeightG).toBeCloseTo(750, 6);
  });

  it('concentrates protein into the smaller cooked weight', () => {
    const r = computeCooked(input);
    // 1000g raw x 22.5g/100g = 225g protein, x 0.98 retention = 220.5g,
    // over 750g cooked = 29.4g per 100g.
    expect(r.totals.protein).toBeCloseTo(220.5, 4);
    expect(r.per100gCooked.protein).toBeCloseTo(29.4, 4);
    expect(r.per100gCooked.protein).toBeGreaterThan(chicken.per100gRaw.protein);
  });

  it('leaches potassium separately from water loss', () => {
    const r = computeCooked(input);
    // 3340mg raw x 0.90 dry-heat retention = 3006mg.
    expect(r.totals.potassium).toBeCloseTo(3006, 3);
  });

  it('reports the yield provenance', () => {
    expect(computeCooked(input).yieldUsed).toEqual({ factor: 0.75, source: 'published', sampleCount: 0 });
  });

  it('produces a trace naming the yield source', () => {
    const r = computeCooked(input);
    const joined = r.steps.map((s) => `${s.label} ${s.detail} ${s.value} ${s.sourceNote ?? ''}`).join(' | ');
    expect(joined).toContain('0.75');
    expect(joined).toContain('published');
    expect(joined).toContain('750');
  });

  it('lists nutrients whose retention was assumed rather than sourced', () => {
    const r = computeCooked({ ...input, retention: {} });
    expect(r.assumedRetentionFor).toContain('protein');
    expect(r.totals.protein).toBeCloseTo(225, 4);
  });

  it('returns zeros and no division by zero for zero weight', () => {
    const r = computeCooked({ ...input, rawG: g(0) });
    expect(r.cookedWeightG).toBe(0);
    expect(r.totals.protein).toBe(0);
    expect(Number.isFinite(r.per100gCooked.protein)).toBe(true);
    expect(r.per100gCooked.protein).toBe(0);
  });

  it('lets a water-absorbing ingredient exceed its raw weight', () => {
    const rice: Ingredient = {
      ...chicken, id: 'white-rice', name: 'White rice', category: 'grain',
      per100gRaw: { ...zeroNutrients(), kcal: 360, protein: 6.6, carbs: 79 },
      publishedYield: { boiled: 2.6 }, absorbsWater: true,
    };
    const r = computeCooked({ ...input, ingredient: rice, rawG: g(100), method: 'boiled' });
    expect(r.cookedWeightG).toBeCloseTo(260, 6);
    expect(r.per100gCooked.carbs).toBeLessThan(rice.per100gRaw.carbs);
  });
});

describe('rawFromCooked', () => {
  it('inverts the yield factor', () => {
    const r = rawFromCooked(chicken, g(750), 'roasted', [], CATEGORY_YIELD);
    expect(r.rawWeightG).toBeCloseTo(1000, 6);
    expect(r.yieldUsed.source).toBe('published');
  });

  it('round-trips raw -> cooked -> raw', () => {
    const cooked = computeCooked(input).cookedWeightG;
    expect(rawFromCooked(chicken, cooked, 'roasted', [], CATEGORY_YIELD).rawWeightG).toBeCloseTo(1000, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/nutrition.test.ts`
Expected: FAIL — cannot resolve `./nutrition`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/nutrition.ts
import type { CookMethod, Ingredient, NutrientKey, NutrientProfile, YieldSample } from './types';
import { mapNutrients, nutrientsForWeight, scaleNutrients, zeroNutrients } from './nutrients';
import { resolveYield, type CategoryYield, type ResolvedYield } from './yieldResolver';
import { retentionFor, type RetentionLookup } from './retention';
import { g, type Grams } from './units';

export interface CalcStep {
  label: string;
  detail: string;
  value: string;
  /** Where the number came from, shown to the user verbatim. */
  sourceNote?: string;
}

export interface CookInput {
  ingredient: Ingredient;
  rawG: Grams;
  method: CookMethod;
  samples: readonly YieldSample[];
  categoryYield: CategoryYield;
  retention: RetentionLookup;
}

export interface CookedResult {
  rawWeightG: Grams;
  cookedWeightG: Grams;
  yieldUsed: ResolvedYield;
  totals: NutrientProfile;
  per100gCooked: NutrientProfile;
  /** Nutrients for which no sourced retention figure existed. */
  assumedRetentionFor: NutrientKey[];
  steps: CalcStep[];
}

const round = (n: number, dp = 1): string => n.toFixed(dp);

function yieldNote(y: ResolvedYield): string {
  switch (y.source) {
    case 'measured':
      return `your average across ${y.sampleCount} cook${y.sampleCount === 1 ? '' : 's'}`;
    case 'published':
      return 'published factor';
    case 'categoryDefault':
      return 'category default — rough estimate';
  }
}

export function computeRaw(ingredient: Ingredient, rawG: Grams): { totals: NutrientProfile; steps: CalcStep[] } {
  const totals = nutrientsForWeight(ingredient.per100gRaw, rawG);
  return {
    totals,
    steps: [
      {
        label: 'Raw',
        detail: `${round(rawG, 0)}g · ${round(ingredient.per100gRaw.protein)}g protein/100g`,
        value: `${round(totals.protein)}g protein total`,
        sourceNote: ingredient.sourceRef,
      },
    ],
  };
}

export function computeCooked(input: CookInput): CookedResult {
  const { ingredient, rawG, method, samples, categoryYield, retention } = input;

  const rawTotals = nutrientsForWeight(ingredient.per100gRaw, rawG);
  const yieldUsed = resolveYield(ingredient, method, samples, categoryYield);
  const cookedWeightG = g(rawG * yieldUsed.factor);

  const assumedRetentionFor: NutrientKey[] = [];
  const totals = mapNutrients(rawTotals, (value, key) => {
    const r = retentionFor(retention, ingredient.category, method, key);
    if (r.assumed) assumedRetentionFor.push(key);
    return value * r.factor;
  });

  const per100gCooked = cookedWeightG === 0
    ? zeroNutrients()
    : scaleNutrients(totals, 100 / cookedWeightG);

  const proteinRetention = retentionFor(retention, ingredient.category, method, 'protein');

  const steps: CalcStep[] = [
    {
      label: 'Raw',
      detail: `${round(rawG, 0)}g · ${round(ingredient.per100gRaw.protein)}g protein/100g`,
      value: `${round(rawTotals.protein)}g protein total`,
      sourceNote: ingredient.sourceRef,
    },
    {
      label: `Yield (${method})`,
      detail: `× ${yieldUsed.factor.toFixed(2)}`,
      value: `${round(cookedWeightG, 0)}g cooked`,
      sourceNote: yieldNote(yieldUsed),
    },
    {
      label: 'Protein retention',
      detail: `× ${proteinRetention.factor.toFixed(2)}`,
      value: `${round(totals.protein)}g protein`,
      sourceNote: proteinRetention.assumed ? 'assumed 100% — no sourced figure' : 'USDA retention factors',
    },
    {
      label: 'Per 100g cooked',
      detail: `${round(totals.protein)}g ÷ ${round(cookedWeightG, 0)}g × 100`,
      value: `${round(per100gCooked.protein)}g protein/100g`,
    },
  ];

  return { rawWeightG: rawG, cookedWeightG, yieldUsed, totals, per100gCooked, assumedRetentionFor, steps };
}

export function rawFromCooked(
  ingredient: Ingredient,
  cookedG: Grams,
  method: CookMethod,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
): { rawWeightG: Grams; yieldUsed: ResolvedYield } {
  const yieldUsed = resolveYield(ingredient, method, samples, categoryYield);
  return { rawWeightG: g(cookedG / yieldUsed.factor), yieldUsed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/nutrition.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/nutrition.ts src/core/nutrition.test.ts
git commit -m "feat: add nutrition engine separating water loss from leaching"
```

---

## Task 8: Ingredient dataset

**Files:**
- Create: `src/data/ingredients.ts`
- Test: `src/data/ingredients.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `NUTRIENT_KEYS`, `CATEGORIES` from `src/core/types`
- Produces: `INGREDIENTS: readonly Ingredient[]`, `findIngredient(id: string): Ingredient | undefined`

**Entry process — follow this for every ingredient.** Look the food up in USDA FoodData Central, prefer a *Foundation* or *SR Legacy* entry over a *Branded* one, take the raw form, record the FDC id in `sourceRef`, and transcribe all eleven nutrients. Where a nutrient is genuinely absent from the entry, record `0` — the validation test's plausibility bands will catch a transcription slip in the values that matter. Do not enter values from memory; the whole point of `sourceRef` is that any figure can be rechecked.

Ship these 62, chosen for Malaysian kitchens:

*Meat* — chicken breast, chicken thigh, chicken drumstick, beef sirloin, beef minced, pork loin, pork belly, lamb leg, duck breast
*Seafood* — ikan kembung (Indian mackerel), ikan tenggiri (Spanish mackerel), ikan bilis (dried anchovy), prawn, squid, salmon, tilapia, kerang (cockles)
*Egg & dairy* — chicken egg, full cream milk, greek yogurt, cheddar
*Legume* — firm tofu, tempeh, dried chickpeas, red lentils, peanuts, soybean
*Grain* — white rice, brown rice, rolled oats, wheat flour, bihun (rice vermicelli), yellow noodles, white bread
*Vegetable* — kangkung, sawi, bayam, cabbage, long beans, bendi (okra), brinjal, carrot, tomato, cucumber, broccoli, cauliflower, taugeh (bean sprouts), pumpkin, sweet potato, potato, onion, garlic, ginger, chilli
*Fruit* — banana, papaya, watermelon, mango, orange, apple, guava, pineapple, avocado, dragonfruit
*Nut* — almond, cashew

- [ ] **Step 1: Write the failing validation test**

```ts
// src/data/ingredients.test.ts
import { describe, it, expect } from 'vitest';
import { INGREDIENTS, findIngredient } from './ingredients';
import { CATEGORIES, NUTRIENT_KEYS } from '../core/types';

describe('INGREDIENTS', () => {
  it('ships at least 60 ingredients', () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(60);
  });

  it('has unique ids', () => {
    const ids = INGREDIENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every ingredient all eleven nutrients as finite non-negative numbers', () => {
    for (const ing of INGREDIENTS) {
      for (const k of NUTRIENT_KEYS) {
        const v = ing.per100gRaw[k];
        expect(Number.isFinite(v), `${ing.id}.${k}`).toBe(true);
        expect(v, `${ing.id}.${k}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cites a source for every bundled ingredient', () => {
    for (const ing of INGREDIENTS) {
      expect(ing.source, ing.id).toBe('usda');
      expect(ing.sourceRef, ing.id).toBeTruthy();
    }
  });

  it('uses a known category and is not archived', () => {
    for (const ing of INGREDIENTS) {
      expect(CATEGORIES, ing.id).toContain(ing.category);
      expect(ing.archived, ing.id).toBe(false);
    }
  });

  it('keeps energy plausible against its macronutrients', () => {
    // Atwater: 4 kcal/g protein and carbs, 9 kcal/g fat. Allow a wide band for
    // fibre, sugar alcohols and rounding in the source data.
    for (const ing of INGREDIENTS) {
      const { kcal, protein, carbs, fat } = ing.per100gRaw;
      const atwater = protein * 4 + carbs * 4 + fat * 9;
      if (atwater < 20) continue;
      expect(kcal, `${ing.id} kcal vs Atwater ${atwater.toFixed(0)}`).toBeGreaterThan(atwater * 0.6);
      expect(kcal, `${ing.id} kcal vs Atwater ${atwater.toFixed(0)}`).toBeLessThan(atwater * 1.4);
    }
  });

  it('keeps macronutrients under 100g per 100g', () => {
    for (const ing of INGREDIENTS) {
      const { protein, carbs, fat } = ing.per100gRaw;
      expect(protein + carbs + fat, ing.id).toBeLessThanOrEqual(100);
    }
  });

  it('marks grains and dried legumes as water-absorbing', () => {
    for (const id of ['white-rice', 'brown-rice', 'rolled-oats', 'dried-chickpeas', 'red-lentils']) {
      expect(findIngredient(id)?.absorbsWater, id).toBe(true);
    }
  });

  it('keeps published yields within a plausible range', () => {
    for (const ing of INGREDIENTS) {
      for (const [method, factor] of Object.entries(ing.publishedYield)) {
        expect(factor, `${ing.id}.${method}`).toBeGreaterThan(0.3);
        expect(factor, `${ing.id}.${method}`).toBeLessThanOrEqual(3.5);
        if (!ing.absorbsWater) expect(factor, `${ing.id}.${method}`).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('finds an ingredient by id and returns undefined for an unknown one', () => {
    expect(findIngredient('chicken-breast')?.name).toBeTruthy();
    expect(findIngredient('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/ingredients.test.ts`
Expected: FAIL — cannot resolve `./ingredients`.

- [ ] **Step 3: Write the dataset**

Use this exact structure. The three entries below are the worked pattern; complete all 62 the same way, following the entry process above.

```ts
// src/data/ingredients.ts
// Nutrient values per 100g RAW. Source: USDA FoodData Central; each entry's
// `sourceRef` is its FDC id so any figure can be rechecked.
// Yield factors: USDA Agriculture Handbook 102.
import type { Ingredient, NutrientProfile } from '../core/types';

const n = (p: Partial<NutrientProfile>): NutrientProfile => ({
  kcal: 0, protein: 0, carbs: 0, fibre: 0, fat: 0,
  potassium: 0, iron: 0, magnesium: 0, zinc: 0, calcium: 0, sodium: 0,
  ...p,
});

export const INGREDIENTS: readonly Ingredient[] = [
  {
    id: 'chicken-breast',
    name: 'Chicken breast, skinless',
    category: 'meat',
    per100gRaw: n({ kcal: 120, protein: 22.5, fat: 2.6, potassium: 334, iron: 0.37, magnesium: 27, zinc: 0.68, calcium: 5, sodium: 45 }),
    publishedYield: { roasted: 0.75, grilled: 0.71, panFried: 0.72, boiled: 0.70, steamed: 0.76 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 171077',
    archived: false,
  },
  {
    id: 'white-rice',
    name: 'White rice, long grain',
    category: 'grain',
    per100gRaw: n({ kcal: 365, protein: 7.1, carbs: 80, fibre: 1.3, fat: 0.7, potassium: 115, iron: 0.8, magnesium: 25, zinc: 1.1, calcium: 28, sodium: 5 }),
    publishedYield: { boiled: 2.6, steamed: 2.4 },
    absorbsWater: true,
    source: 'usda',
    sourceRef: 'FDC 169756',
    archived: false,
  },
  {
    id: 'kangkung',
    name: 'Kangkung (water spinach)',
    category: 'vegetable',
    per100gRaw: n({ kcal: 19, protein: 2.6, carbs: 3.1, fibre: 2.1, fat: 0.2, potassium: 312, iron: 1.67, magnesium: 71, zinc: 0.18, calcium: 77, sodium: 113 }),
    publishedYield: { boiled: 0.88, steamed: 0.92, stirFried: 0.78 },
    absorbsWater: false,
    source: 'usda',
    sourceRef: 'FDC 168390',
    archived: false,
  },
  // ... complete the remaining 59 ingredients from the list above,
  // each following this exact shape and entry process.
];

const BY_ID = new Map(INGREDIENTS.map((i) => [i.id, i]));

export const findIngredient = (id: string): Ingredient | undefined => BY_ID.get(id);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/ingredients.test.ts`
Expected: PASS, 10 tests. Any failure names the offending ingredient and field — fix the data, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/data/ingredients.ts src/data/ingredients.test.ts
git commit -m "feat: add bundled ingredient dataset with validation"
```

---

## Task 9: Golden-value regression tests

**Files:**
- Create: `src/core/golden.test.ts`

**Interfaces:**
- Consumes: `computeCooked` from `./nutrition`; `INGREDIENTS`, `findIngredient` from `../data/ingredients`; `CATEGORY_YIELD`, `RETENTION`
- Produces: no exports — this is the regression net for the whole calculation core

This is the most valuable suite in Phase 1. For foods where USDA publishes *both* a raw and a cooked entry, derive the cooked figures from raw + yield + retention and assert they land near USDA's own cooked values. If a factor is wrong or a conversion inverts, this fails loudly and names the food and nutrient.

**Tolerances are deliberately wide** — ±12% for macronutrients, ±20% for minerals. The model is an approximation and the tolerance states how approximate. Tightening these to hide a failure would defeat the purpose; if a case cannot pass at these bands, the factor or the transcribed value is wrong.

- [ ] **Step 1: Write the golden test**

```ts
// src/core/golden.test.ts
import { describe, it, expect } from 'vitest';
import { computeCooked } from './nutrition';
import { findIngredient } from '../data/ingredients';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';
import { g } from './units';
import type { CookMethod, NutrientKey } from './types';

const MACRO_TOLERANCE = 0.12;
const MINERAL_TOLERANCE = 0.20;
const MINERALS: NutrientKey[] = ['potassium', 'iron', 'magnesium', 'zinc', 'calcium'];

interface GoldenCase {
  ingredientId: string;
  method: CookMethod;
  /** USDA's own COOKED entry, per 100g cooked. */
  usdaCookedRef: string;
  expectedPer100gCooked: Partial<Record<NutrientKey, number>>;
}

// Populate each case from the USDA cooked entry named in usdaCookedRef.
// Add at least 20 cases spanning meat, seafood, vegetable, grain and legume,
// and include at least three water-absorbing foods.
const CASES: GoldenCase[] = [
  {
    ingredientId: 'chicken-breast',
    method: 'roasted',
    usdaCookedRef: 'FDC 171534 — chicken breast, roasted',
    expectedPer100gCooked: { protein: 31.0, kcal: 165, fat: 3.6, potassium: 256 },
  },
  {
    ingredientId: 'white-rice',
    method: 'boiled',
    usdaCookedRef: 'FDC 169757 — white rice, cooked',
    expectedPer100gCooked: { protein: 2.7, kcal: 130, carbs: 28.2, potassium: 35 },
  },
  // ... add the remaining cases.
];

describe('golden values: derived cooked nutrients vs USDA cooked entries', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  for (const c of CASES) {
    it(`${c.ingredientId} ${c.method} matches ${c.usdaCookedRef}`, () => {
      const ingredient = findIngredient(c.ingredientId);
      expect(ingredient, `unknown ingredient ${c.ingredientId}`).toBeDefined();
      if (!ingredient) return;

      const result = computeCooked({
        ingredient,
        rawG: g(1000),
        method: c.method,
        samples: [],
        categoryYield: CATEGORY_YIELD,
        retention: RETENTION,
      });

      for (const [key, expected] of Object.entries(c.expectedPer100gCooked) as [NutrientKey, number][]) {
        const actual = result.per100gCooked[key];
        const tolerance = MINERALS.includes(key) ? MINERAL_TOLERANCE : MACRO_TOLERANCE;
        const drift = Math.abs(actual - expected) / expected;
        expect(
          drift,
          `${c.ingredientId}.${key}: derived ${actual.toFixed(1)} vs USDA ${expected} (${(drift * 100).toFixed(1)}% off, limit ${(tolerance * 100).toFixed(0)}%)`,
        ).toBeLessThanOrEqual(tolerance);
      }
    });
  }
});
```

- [ ] **Step 2: Run the test and expect some failures**

Run: `npx vitest run src/core/golden.test.ts`
Expected: the "at least 20 cases" test FAILS until the case list is complete, and some individual cases may fail.

- [ ] **Step 3: Complete the case list and reconcile failures**

Add cases until there are at least 20. For each failure, investigate in this order and fix the **data**, never the tolerance:

1. Is the raw value in `ingredients.ts` transcribed correctly from FDC?
2. Is the published yield factor right for this food and method?
3. Is the retention factor for this category/method/nutrient right?
4. Only if all three check out and the drift is still outside the band: record the case in a `KNOWN_DIVERGENCES` array with a comment explaining what the model cannot capture, and exclude it explicitly. An excluded case must carry a written reason.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, every suite green.

- [ ] **Step 5: Commit**

```bash
git add src/core/golden.test.ts src/data/ingredients.ts src/data/retentionTable.ts src/data/categoryYield.ts
git commit -m "test: add golden-value regression suite against USDA cooked entries"
```

---

## Task 10: Reference intake tables

**Files:**
- Create: `src/data/rniMY.ts`, `src/data/dvUS.ts`
- Test: `src/data/referenceIntakes.test.ts`

**Interfaces:**
- Consumes: `NutrientKey`, `Sex` from `src/core/types`
- Produces:
  - `RNI_MY: { bands: readonly RniBand[] }` where `RniBand = { sex: Sex; minAge: number; maxAge: number; values: Partial<Record<NutrientKey, number>> }`
  - `rniFor(sex: Sex, age: number): Partial<Record<NutrientKey, number>>`
  - `DV_US: Partial<Record<NutrientKey, number>>`

**Iron carries a caveat.** The Malaysian RNI states iron at several dietary bioavailability levels. Pick the **15% bioavailability** figure, and put a comment in the file saying so, so the displayed number is never mistaken for the only figure.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/referenceIntakes.test.ts
import { describe, it, expect } from 'vitest';
import { RNI_MY, rniFor } from './rniMY';
import { DV_US } from './dvUS';

describe('RNI_MY', () => {
  it('covers adult ages for both sexes without gaps', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const age of [19, 25, 40, 55, 65, 80]) {
        const v = rniFor(sex, age);
        expect(Object.keys(v).length, `${sex} ${age}`).toBeGreaterThan(0);
        expect(v.potassium, `${sex} ${age}`).toBeGreaterThan(0);
      }
    }
  });

  it('has non-overlapping bands within a sex', () => {
    for (const sex of ['male', 'female'] as const) {
      const bands = RNI_MY.bands.filter((b) => b.sex === sex).sort((a, b) => a.minAge - b.minAge);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i]!.minAge, `${sex} band ${i}`).toBeGreaterThan(bands[i - 1]!.maxAge);
      }
    }
  });

  it('recommends more iron for women of reproductive age than for men', () => {
    expect(rniFor('female', 30).iron!).toBeGreaterThan(rniFor('male', 30).iron!);
  });

  it('keeps every value finite and positive', () => {
    for (const band of RNI_MY.bands) {
      for (const [k, v] of Object.entries(band.values)) {
        expect(Number.isFinite(v), `${band.sex} ${band.minAge} ${k}`).toBe(true);
        expect(v, `${band.sex} ${band.minAge} ${k}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('DV_US', () => {
  it('covers every micronutrient the app displays', () => {
    for (const k of ['potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium'] as const) {
      expect(DV_US[k], k).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/referenceIntakes.test.ts`
Expected: FAIL — cannot resolve `./rniMY`.

- [ ] **Step 3: Write the tables**

Transcribe every figure from the cited publications. The values below are the structure and a starting point; verify each against the source before committing.

```ts
// src/data/rniMY.ts
// Recommended Nutrient Intakes for Malaysia, NCCFN / Ministry of Health, 2017.
// Iron figures are the 15% dietary bioavailability level; the RNI also
// publishes 10% and 12% levels, and the UI labels which one is shown.
import type { NutrientKey, Sex } from '../core/types';

export interface RniBand {
  sex: Sex;
  minAge: number;
  maxAge: number;
  values: Partial<Record<NutrientKey, number>>;
}

export const RNI_MY: { bands: readonly RniBand[] } = {
  bands: [
    { sex: 'male',   minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 14, magnesium: 330, zinc: 6.7, calcium: 1000, sodium: 2000, protein: 62 } },
    { sex: 'male',   minAge: 30, maxAge: 59, values: { potassium: 4700, iron: 14, magnesium: 350, zinc: 6.7, calcium: 1000, sodium: 2000, protein: 62 } },
    { sex: 'male',   minAge: 60, maxAge: 200, values: { potassium: 4700, iron: 14, magnesium: 350, zinc: 6.7, calcium: 1000, sodium: 2000, protein: 62 } },
    { sex: 'female', minAge: 19, maxAge: 29, values: { potassium: 4700, iron: 29, magnesium: 260, zinc: 4.9, calcium: 1000, sodium: 2000, protein: 55 } },
    { sex: 'female', minAge: 30, maxAge: 50, values: { potassium: 4700, iron: 29, magnesium: 265, zinc: 4.9, calcium: 1000, sodium: 2000, protein: 55 } },
    { sex: 'female', minAge: 51, maxAge: 200, values: { potassium: 4700, iron: 11, magnesium: 265, zinc: 4.9, calcium: 1000, sodium: 2000, protein: 55 } },
  ],
};

export function rniFor(sex: Sex, age: number): Partial<Record<NutrientKey, number>> {
  const band = RNI_MY.bands.find((b) => b.sex === sex && age >= b.minAge && age <= b.maxAge);
  return band?.values ?? {};
}
```

```ts
// src/data/dvUS.ts
// FDA Daily Values for adults and children 4+, as used on Nutrition Facts labels.
// A single figure per nutrient, not adjusted for age or sex.
import type { NutrientKey } from '../core/types';

export const DV_US: Partial<Record<NutrientKey, number>> = {
  kcal: 2000,
  protein: 50,
  carbs: 275,
  fibre: 28,
  fat: 78,
  potassium: 4700,
  iron: 18,
  magnesium: 420,
  zinc: 11,
  calcium: 1300,
  sodium: 2300,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/referenceIntakes.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/rniMY.ts src/data/dvUS.ts src/data/referenceIntakes.test.ts
git commit -m "feat: add Malaysian RNI and US DV reference intake tables"
```

---

## Task 11: Targets engine

**Files:**
- Create: `src/core/targets.ts`
- Test: `src/core/targets.test.ts`

**Interfaces:**
- Consumes: `Profile`, `NutrientKey`, `Sex` from `./types`
- Produces:
  - `ageFrom(profile: Profile, today: Date): number`
  - `bmr(profile: Profile, today: Date): number`
  - `activityMultiplier(sessionsPerWeek: number): number`
  - `tdee(profile: Profile, today: Date): number`
  - `calorieTarget(profile: Profile, today: Date): number`
  - `proteinGPerKgFor(profile: Profile): number` — the override if set, else the goal default
  - `proteinTargetG(profile: Profile): number`
  - `proteinGPerLb(profile: Profile): number`
  - `interface MicroTarget { rni?: number; dv?: number }`
  - `microTargets(profile, today, rniLookup, dvTable): Partial<Record<NutrientKey, MicroTarget>>`

Calories and protein come from the profile; only micronutrients need the published tables, which are passed in to preserve core purity.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/targets.test.ts
import { describe, it, expect } from 'vitest';
import { ageFrom, bmr, activityMultiplier, tdee, calorieTarget, proteinTargetG, proteinGPerLb, microTargets } from './targets';
import type { Profile } from './types';
import { rniFor } from '../data/rniMY';
import { DV_US } from '../data/dvUS';

const TODAY = new Date('2026-09-17T00:00:00Z');

const male: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

describe('targets', () => {
  it('derives age from birth year', () => {
    expect(ageFrom(male, TODAY)).toBe(30);
  });

  it('computes male BMR via Mifflin-St Jeor', () => {
    // 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
    expect(bmr(male, TODAY)).toBeCloseTo(1698.75, 2);
  });

  it('computes female BMR via Mifflin-St Jeor', () => {
    const female: Profile = { ...male, sex: 'female' };
    // 750 + 1093.75 - 150 - 161 = 1532.75
    expect(bmr(female, TODAY)).toBeCloseTo(1532.75, 2);
  });

  it('maps training frequency to an activity multiplier', () => {
    expect(activityMultiplier(0)).toBe(1.2);
    expect(activityMultiplier(1)).toBe(1.375);
    expect(activityMultiplier(2)).toBe(1.375);
    expect(activityMultiplier(3)).toBe(1.55);
    expect(activityMultiplier(4)).toBe(1.55);
    expect(activityMultiplier(5)).toBe(1.725);
    expect(activityMultiplier(6)).toBe(1.725);
    expect(activityMultiplier(7)).toBe(1.9);
    expect(activityMultiplier(12)).toBe(1.9);
  });

  it('computes TDEE from BMR and activity', () => {
    expect(tdee(male, TODAY)).toBeCloseTo(1698.75 * 1.55, 2);
  });

  it('adjusts the calorie target by goal', () => {
    const base = tdee(male, TODAY);
    expect(calorieTarget(male, TODAY)).toBeCloseTo(base, 2);
    expect(calorieTarget({ ...male, goal: 'cut' }, TODAY)).toBeCloseTo(base * 0.85, 2);
    expect(calorieTarget({ ...male, goal: 'bulk' }, TODAY)).toBeCloseTo(base * 1.10, 2);
  });

  it('sets protein target by goal and allows an override', () => {
    expect(proteinTargetG({ ...male, goal: 'cut' })).toBeCloseTo(75 * 2.2, 4);
    expect(proteinTargetG({ ...male, goal: 'maintain' })).toBeCloseTo(75 * 1.8, 4);
    expect(proteinTargetG({ ...male, goal: 'bulk' })).toBeCloseTo(75 * 2.0, 4);
    expect(proteinTargetG({ ...male, proteinGPerKg: 1.6 })).toBeCloseTo(75 * 1.6, 4);
  });

  it('expresses the protein target per pound as well as per kilogram', () => {
    expect(proteinGPerLb({ ...male, proteinGPerKg: 2.2 })).toBeCloseTo(2.2 / 2.20462, 4);
  });

  it('returns both RNI and DV figures for micronutrients', () => {
    const t = microTargets(male, TODAY, rniFor, DV_US);
    expect(t.potassium?.rni).toBeGreaterThan(0);
    expect(t.potassium?.dv).toBeGreaterThan(0);
    expect(t.iron?.rni).toBeGreaterThan(0);
  });

  it('omits a standard that has no figure rather than inventing one', () => {
    const t = microTargets(male, TODAY, () => ({}), {});
    expect(t.potassium?.rni).toBeUndefined();
    expect(t.potassium?.dv).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/targets.test.ts`
Expected: FAIL — cannot resolve `./targets`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/targets.ts
import { NUTRIENT_KEYS, type Goal, type NutrientKey, type Profile, type Sex } from './types';

const KG_PER_LB = 2.20462;

const GOAL_CALORIE_FACTOR: Record<Goal, number> = { cut: 0.85, maintain: 1.0, bulk: 1.10 };
const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 1.8, bulk: 2.0 };

export const ageFrom = (profile: Profile, today: Date): number =>
  today.getUTCFullYear() - profile.birthYear;

/** Mifflin-St Jeor. The formula has two variants, selected by `profile.sex`. */
export function bmr(profile: Profile, today: Date): number {
  const age = ageFrom(profile, today);
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function activityMultiplier(sessionsPerWeek: number): number {
  if (sessionsPerWeek <= 0) return 1.2;
  if (sessionsPerWeek <= 2) return 1.375;
  if (sessionsPerWeek <= 4) return 1.55;
  if (sessionsPerWeek <= 6) return 1.725;
  return 1.9;
}

export const tdee = (profile: Profile, today: Date): number =>
  bmr(profile, today) * activityMultiplier(profile.sessionsPerWeek);

export const calorieTarget = (profile: Profile, today: Date): number =>
  tdee(profile, today) * GOAL_CALORIE_FACTOR[profile.goal];

export const proteinGPerKgFor = (profile: Profile): number =>
  profile.proteinGPerKg ?? GOAL_PROTEIN_G_PER_KG[profile.goal];

export const proteinTargetG = (profile: Profile): number =>
  proteinGPerKgFor(profile) * profile.weightKg;

export const proteinGPerLb = (profile: Profile): number =>
  proteinGPerKgFor(profile) / KG_PER_LB;

export interface MicroTarget {
  rni?: number;
  dv?: number;
}

export type RniLookup = (sex: Sex, age: number) => Partial<Record<NutrientKey, number>>;

export function microTargets(
  profile: Profile,
  today: Date,
  rniLookup: RniLookup,
  dvTable: Partial<Record<NutrientKey, number>>,
): Partial<Record<NutrientKey, MicroTarget>> {
  const rni = rniLookup(profile.sex, ageFrom(profile, today));
  const out: Partial<Record<NutrientKey, MicroTarget>> = {};
  for (const k of NUTRIENT_KEYS) {
    const entry: MicroTarget = {};
    if (rni[k] !== undefined) entry.rni = rni[k];
    if (dvTable[k] !== undefined) entry.dv = dvTable[k];
    if (entry.rni !== undefined || entry.dv !== undefined) out[k] = entry;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/targets.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/targets.ts src/core/targets.test.ts
git commit -m "feat: add BMR, TDEE, protein and micronutrient targets"
```

---

## Task 12: Method comparison

**Files:**
- Create: `src/core/methodCompare.ts`
- Test: `src/core/methodCompare.test.ts`

**Interfaces:**
- Consumes: `resolveYield`, `CategoryYield` from `./yieldResolver`; `retentionFor`, `RetentionLookup` from `./retention`; `COOK_METHODS` from `./types`
- Produces:
  - `interface MethodRow { method, yieldFactor, yieldSource, weightKeptPct, retainedPct: Partial<Record<NutrientKey, number>>, score }`
  - `compareMethods(ingredient, samples, categoryYield, retention, highlight: readonly NutrientKey[]): MethodRow[]`

**A nutrient's retained percentage is the retention factor alone, not the yield.** Yield governs weight; retention governs how much of the nutrient's mass survives. Multiplying the two here would double-count the water loss.

Rows are sorted by `score` descending — the mean retained fraction across `highlight` — with ties broken alphabetically by method so the order is deterministic.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/methodCompare.test.ts
import { describe, it, expect } from 'vitest';
import { compareMethods } from './methodCompare';
import { zeroNutrients } from './nutrients';
import { g } from './units';
import type { Ingredient } from './types';
import { CATEGORY_YIELD } from '../data/categoryYield';
import { RETENTION } from '../data/retentionTable';

const kangkung: Ingredient = {
  id: 'kangkung', name: 'Kangkung', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 19, protein: 2.6, potassium: 312, magnesium: 71 },
  publishedYield: { boiled: 0.88, steamed: 0.92, stirFried: 0.78 },
  absorbsWater: false, source: 'usda', sourceRef: 'FDC 168390', archived: false,
};

const rows = () => compareMethods(kangkung, [], CATEGORY_YIELD, RETENTION, ['potassium', 'magnesium']);

describe('compareMethods', () => {
  it('returns one row per cooking method', () => {
    expect(rows().length).toBe(7);
  });

  it('ranks steaming above boiling for a leafy vegetable', () => {
    const order = rows().map((r) => r.method);
    expect(order.indexOf('steamed')).toBeLessThan(order.indexOf('boiled'));
  });

  it('reports retained nutrient percentage independently of the yield factor', () => {
    const steamed = rows().find((r) => r.method === 'steamed')!;
    expect(steamed.weightKeptPct).toBeCloseTo(92, 4);
    expect(steamed.retainedPct.potassium).toBeCloseTo(92, 4);
    expect(steamed.retainedPct.potassium).not.toBeCloseTo(92 * 0.92, 4);
  });

  it('carries the yield provenance onto each row', () => {
    const boiled = rows().find((r) => r.method === 'boiled')!;
    expect(boiled.yieldSource).toBe('published');
    const grilled = rows().find((r) => r.method === 'grilled')!;
    expect(grilled.yieldSource).toBe('categoryDefault');
  });

  it('sorts deterministically, breaking ties by method name', () => {
    expect(rows().map((r) => r.method)).toEqual(rows().map((r) => r.method));
  });

  it('prefers the user measured yield once samples exist', () => {
    const samples = [{
      ingredientId: 'kangkung', method: 'steamed' as const,
      rawUsedG: g(500), cookedWeightG: g(400), excludeFromCalibration: false,
    }];
    const r = compareMethods(kangkung, samples, CATEGORY_YIELD, RETENTION, ['potassium']);
    const steamed = r.find((x) => x.method === 'steamed')!;
    expect(steamed.yieldSource).toBe('measured');
    expect(steamed.weightKeptPct).toBeCloseTo(80, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/methodCompare.test.ts`
Expected: FAIL — cannot resolve `./methodCompare`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/methodCompare.ts
import { COOK_METHODS, type CookMethod, type Ingredient, type NutrientKey, type YieldSample } from './types';
import { resolveYield, type CategoryYield, type YieldSource } from './yieldResolver';
import { retentionFor, type RetentionLookup } from './retention';

export interface MethodRow {
  method: CookMethod;
  yieldFactor: number;
  yieldSource: YieldSource;
  /** Percentage of raw WEIGHT remaining after cooking. */
  weightKeptPct: number;
  /** Percentage of each nutrient's MASS surviving. Independent of weight. */
  retainedPct: Partial<Record<NutrientKey, number>>;
  /** Mean retained fraction across the highlighted nutrients; sort key. */
  score: number;
}

export function compareMethods(
  ingredient: Ingredient,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
  retention: RetentionLookup,
  highlight: readonly NutrientKey[],
): MethodRow[] {
  const rows = COOK_METHODS.map((method): MethodRow => {
    const y = resolveYield(ingredient, method, samples, categoryYield);

    const retainedPct: Partial<Record<NutrientKey, number>> = {};
    for (const key of highlight) {
      retainedPct[key] = retentionFor(retention, ingredient.category, method, key).factor * 100;
    }

    const score = highlight.length === 0
      ? 0
      : highlight.reduce((sum, k) => sum + (retainedPct[k] ?? 0), 0) / highlight.length;

    return { method, yieldFactor: y.factor, yieldSource: y.source, weightKeptPct: y.factor * 100, retainedPct, score };
  });

  return rows.sort((a, b) => (b.score - a.score) || a.method.localeCompare(b.method));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/methodCompare.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/methodCompare.ts src/core/methodCompare.test.ts
git commit -m "feat: add computed cooking method comparison"
```

---

## Task 13: Storage layer

**Files:**
- Create: `src/storage/db.ts`, `src/storage/profiles.ts`, `src/storage/settings.ts`, `src/storage/userIngredients.ts`
- Test: `src/storage/storage.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `Profile` from `src/core/types`
- Produces:
  - `interface Settings { id: 'singleton'; activeProfileId: string | null; landingTab: 'today' | 'calc'; defaultWeightUnit: 'g' | 'kg' }`
  - `db` (Dexie instance, schema version 1: `profiles`, `userIngredients`, `settings`)
  - `isStorageAvailable(): Promise<boolean>`
  - `listProfiles()`, `saveProfile(p)`, `deleteProfile(id)`
  - `getSettings(): Promise<Settings>` (returns defaults if absent), `saveSettings(s)`
  - `listUserIngredients()`, `saveUserIngredient(i)`, `archiveUserIngredient(id)`

Schema version 1 declares only Phase 1's tables. Phase 2 adds `batches` and `cookSessions` as version 2, so no migration of existing data is needed.

`archiveUserIngredient` sets `archived: true` rather than deleting, per the spec — Phase 2's batches will reference these rows.

- [ ] **Step 1: Write the failing test**

```ts
// src/storage/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, isStorageAvailable } from './db';
import { listProfiles, saveProfile, deleteProfile } from './profiles';
import { getSettings, saveSettings } from './settings';
import { listUserIngredients, saveUserIngredient, archiveUserIngredient } from './userIngredients';
import { zeroNutrients } from '../core/nutrients';
import type { Profile, Ingredient } from '../core/types';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

const custom: Ingredient = {
  id: 'u1', name: 'Petai', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 140, protein: 6 },
  publishedYield: {}, absorbsWater: false, source: 'user', archived: false,
};

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
  await db.userIngredients.clear();
});

describe('storage', () => {
  it('reports availability', async () => {
    expect(await isStorageAvailable()).toBe(true);
  });

  it('round-trips a profile', async () => {
    await saveProfile(profile);
    expect(await listProfiles()).toEqual([profile]);
  });

  it('updates a profile in place rather than duplicating it', async () => {
    await saveProfile(profile);
    await saveProfile({ ...profile, weightKg: 72 });
    const all = await listProfiles();
    expect(all.length).toBe(1);
    expect(all[0]!.weightKg).toBe(72);
  });

  it('deletes a profile', async () => {
    await saveProfile(profile);
    await deleteProfile('p1');
    expect(await listProfiles()).toEqual([]);
  });

  it('returns default settings when none are stored', async () => {
    expect(await getSettings()).toEqual({
      id: 'singleton', activeProfileId: null, landingTab: 'today', defaultWeightUnit: 'g',
    });
  });

  it('persists settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: 'p1', landingTab: 'calc', defaultWeightUnit: 'kg' });
    expect((await getSettings()).landingTab).toBe('calc');
  });

  it('archives a user ingredient instead of deleting it', async () => {
    await saveUserIngredient(custom);
    await archiveUserIngredient('u1');
    const all = await listUserIngredients();
    expect(all.length).toBe(1);
    expect(all[0]!.archived).toBe(true);
  });
});
```

- [ ] **Step 2: Install the test double and run the test**

```bash
npm install -D fake-indexeddb
```

Run: `npx vitest run src/storage/storage.test.ts`
Expected: FAIL — cannot resolve `./db`.

- [ ] **Step 3: Write the storage layer**

```ts
// src/storage/db.ts
import Dexie, { type Table } from 'dexie';
import type { Ingredient, Profile } from '../core/types';

export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: 'today' | 'calc';
  defaultWeightUnit: 'g' | 'kg';
}

export class IngCalcDB extends Dexie {
  profiles!: Table<Profile, string>;
  userIngredients!: Table<Ingredient, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('ingcalc');
    // Version 2 will add `batches` and `cookSessions` in Phase 2.
    this.version(1).stores({
      profiles: 'id',
      userIngredients: 'id, category, archived',
      settings: 'id',
    });
  }
}

export const db = new IngCalcDB();

/**
 * Private browsing can make IndexedDB unavailable. The app must say so at
 * launch rather than silently discarding everything the user enters.
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await db.open();
    await db.settings.limit(1).toArray();
    return true;
  } catch {
    return false;
  }
}
```

```ts
// src/storage/profiles.ts
import { db } from './db';
import type { Profile } from '../core/types';

export const listProfiles = (): Promise<Profile[]> => db.profiles.toArray();
export const saveProfile = async (p: Profile): Promise<void> => { await db.profiles.put(p); };
export const deleteProfile = async (id: string): Promise<void> => { await db.profiles.delete(id); };
```

```ts
// src/storage/settings.ts
import { db, type Settings } from './db';

const DEFAULTS: Settings = {
  id: 'singleton',
  activeProfileId: null,
  landingTab: 'today',
  defaultWeightUnit: 'g',
};

export const getSettings = async (): Promise<Settings> =>
  (await db.settings.get('singleton')) ?? DEFAULTS;

export const saveSettings = async (s: Settings): Promise<void> => { await db.settings.put(s); };
```

```ts
// src/storage/userIngredients.ts
import { db } from './db';
import type { Ingredient } from '../core/types';

export const listUserIngredients = (): Promise<Ingredient[]> => db.userIngredients.toArray();

export const saveUserIngredient = async (i: Ingredient): Promise<void> => {
  await db.userIngredients.put({ ...i, source: 'user' });
};

/** Archived, never deleted: Phase 2 batches will reference these rows. */
export const archiveUserIngredient = async (id: string): Promise<void> => {
  await db.userIngredients.update(id, { archived: true });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/storage/storage.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage package.json package-lock.json
git commit -m "feat: add Dexie storage for profiles, settings and user ingredients"
```

---

## Task 14: Ingredient catalogue hook

**Files:**
- Create: `src/ui/useCatalogue.ts`
- Test: `src/ui/useCatalogue.test.ts`

**Interfaces:**
- Consumes: `INGREDIENTS` from `src/data/ingredients`; `listUserIngredients` from `src/storage/userIngredients`
- Produces:
  - `mergeCatalogue(bundled: readonly Ingredient[], user: readonly Ingredient[]): Ingredient[]` — pure, testable without React
  - `useCatalogue(): { catalogue: Ingredient[]; loading: boolean }`

A user entry with the same id as a bundled one overrides it; archived entries are excluded; results are sorted by name so the picker is stable.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/useCatalogue.test.ts
import { describe, it, expect } from 'vitest';
import { mergeCatalogue } from './useCatalogue';
import { zeroNutrients } from '../core/nutrients';
import type { Ingredient } from '../core/types';

const make = (id: string, name: string, over: Partial<Ingredient> = {}): Ingredient => ({
  id, name, category: 'vegetable', per100gRaw: zeroNutrients(),
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false, ...over,
});

describe('mergeCatalogue', () => {
  it('combines bundled and user ingredients', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('b', 'Banana', { source: 'user' })]);
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('sorts by name', () => {
    const r = mergeCatalogue([make('z', 'Zucchini'), make('a', 'Apple')], []);
    expect(r.map((i) => i.name)).toEqual(['Apple', 'Zucchini']);
  });

  it('lets a user entry override a bundled one with the same id', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('a', 'My apple', { source: 'user' })]);
    expect(r.length).toBe(1);
    expect(r[0]!.name).toBe('My apple');
  });

  it('excludes archived entries', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('b', 'Bad', { source: 'user', archived: true })]);
    expect(r.map((i) => i.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/useCatalogue.test.ts`
Expected: FAIL — cannot resolve `./useCatalogue`.

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/useCatalogue.ts
import { useEffect, useState } from 'react';
import type { Ingredient } from '../core/types';
import { INGREDIENTS } from '../data/ingredients';
import { listUserIngredients } from '../storage/userIngredients';

export function mergeCatalogue(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): Ingredient[] {
  const byId = new Map<string, Ingredient>();
  for (const i of bundled) byId.set(i.id, i);
  for (const i of user) byId.set(i.id, i);
  return [...byId.values()]
    .filter((i) => !i.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useCatalogue(): { catalogue: Ingredient[]; loading: boolean } {
  const [catalogue, setCatalogue] = useState<Ingredient[]>(() => mergeCatalogue(INGREDIENTS, []));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listUserIngredients()
      .then((user) => { if (!cancelled) setCatalogue(mergeCatalogue(INGREDIENTS, user)); })
      .catch(() => { /* storage unavailable: the bundled catalogue still works */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { catalogue, loading };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/useCatalogue.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useCatalogue.ts src/ui/useCatalogue.test.ts
git commit -m "feat: merge bundled and user ingredients into one catalogue"
```

---

## Task 15: Weight input with unit toggle

**Files:**
- Create: `src/ui/components/WeightInput.tsx`
- Test: `src/ui/components/WeightInput.test.tsx`

**Interfaces:**
- Consumes: `g`, `kgToG`, `gToKg`, `Grams` from `src/core/units`
- Produces: `<WeightInput value={Grams} unit={'g'|'kg'} onChange={(v: Grams) => void} onUnitChange={(u) => void} label={string} />`

This component is the *only* place kilograms exist. It converts at the edge and emits `Grams`, satisfying the global constraint.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/components/WeightInput.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeightInput } from './WeightInput';
import { g } from '../../core/units';

describe('WeightInput', () => {
  it('shows grams unchanged', () => {
    render(<WeightInput value={g(750)} unit="g" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(750);
  });

  it('displays the gram value in kilograms when the unit is kg', () => {
    render(<WeightInput value={g(1500)} unit="kg" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(1.5);
  });

  it('emits grams when the user types kilograms', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(0)} unit="kg" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '1.2' } });
    expect(onChange).toHaveBeenCalledWith(1200);
  });

  it('ignores a negative entry rather than throwing', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(100)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '-5' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be negative/i);
  });

  it('switches units without changing the underlying weight', () => {
    const onUnitChange = vi.fn();
    render(<WeightInput value={g(1500)} unit="g" onChange={vi.fn()} onUnitChange={onUnitChange} label="Weight" />);
    fireEvent.click(screen.getByRole('button', { name: 'kg' }));
    expect(onUnitChange).toHaveBeenCalledWith('kg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/components/WeightInput.test.tsx`
Expected: FAIL — cannot resolve `./WeightInput`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/components/WeightInput.tsx
import { useId, useState } from 'react';
import { g, gToKg, kgToG, type Grams } from '../../core/units';

export type WeightUnit = 'g' | 'kg';

interface Props {
  value: Grams;
  unit: WeightUnit;
  label: string;
  onChange: (value: Grams) => void;
  onUnitChange: (unit: WeightUnit) => void;
}

export function WeightInput({ value, unit, label, onChange, onUnitChange }: Props) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const displayed = unit === 'kg' ? gToKg(value) : value;

  const handle = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a number');
      return;
    }
    if (parsed < 0) {
      setError('Weight cannot be negative');
      return;
    }
    setError(null);
    onChange(unit === 'kg' ? kgToG(parsed) : g(parsed));
  };

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={unit === 'kg' ? 0.01 : 1}
        value={displayed}
        onChange={(e) => handle(e.target.value)}
      />
      {(['g', 'kg'] as const).map((u) => (
        <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnitChange(u)}>
          {u}
        </button>
      ))}
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/components/WeightInput.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/WeightInput.tsx src/ui/components/WeightInput.test.tsx
git commit -m "feat: add weight input converting kg to grams at the edge"
```

---

## Task 16: Calculation trace and nutrient table components

**Files:**
- Create: `src/ui/components/CalcTrace.tsx`, `src/ui/components/NutrientTable.tsx`
- Test: `src/ui/components/CalcTrace.test.tsx`, `src/ui/components/NutrientTable.test.tsx`

**Interfaces:**
- Consumes: `CalcStep` from `src/core/nutrition`; `MicroTarget` from `src/core/targets`; `NutrientProfile`, `NUTRIENT_KEYS` from `src/core/types`
- Produces:
  - `<CalcTrace steps={CalcStep[]} />`
  - `<NutrientTable totals={NutrientProfile} targets={Partial<Record<NutrientKey, MicroTarget>>} assumedRetentionFor={NutrientKey[]} />`

`NutrientTable` shows both percentages per the spec: `Potassium 2,560mg · 73% RNI · 54% DV`. Where a standard has no figure, that column reads `—` rather than being computed from the other.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/components/CalcTrace.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalcTrace } from './CalcTrace';

const steps = [
  { label: 'Raw', detail: '1000g · 22.5g protein/100g', value: '225.0g protein total', sourceNote: 'FDC 171077' },
  { label: 'Yield (roasted)', detail: '× 0.75', value: '750g cooked', sourceNote: 'published factor' },
];

describe('CalcTrace', () => {
  it('renders every step with its label, detail and value', () => {
    render(<CalcTrace steps={steps} />);
    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('× 0.75')).toBeInTheDocument();
    expect(screen.getByText('750g cooked')).toBeInTheDocument();
  });

  it('shows the provenance of each number', () => {
    render(<CalcTrace steps={steps} />);
    expect(screen.getByText('published factor')).toBeInTheDocument();
    expect(screen.getByText('FDC 171077')).toBeInTheDocument();
  });

  it('renders nothing when there are no steps', () => {
    const { container } = render(<CalcTrace steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

```tsx
// src/ui/components/NutrientTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NutrientTable } from './NutrientTable';
import { zeroNutrients } from '../../core/nutrients';

const totals = { ...zeroNutrients(), protein: 44, potassium: 2560, iron: 4.1 };
const targets = {
  protein: { rni: 62, dv: 50 },
  potassium: { rni: 4700, dv: 4700 },
  iron: { rni: 14 },
};

describe('NutrientTable', () => {
  it('shows both RNI and DV percentages', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /potassium/i });
    expect(within(row).getByText('2,560mg')).toBeInTheDocument();
    expect(within(row).getByText('54% RNI')).toBeInTheDocument();
    expect(within(row).getByText('54% DV')).toBeInTheDocument();
  });

  it('shows a dash where a standard has no figure rather than reusing the other', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /iron/i });
    expect(within(row).getByText('29% RNI')).toBeInTheDocument();
    expect(within(row).getByText('— DV')).toBeInTheDocument();
  });

  it('flags nutrients whose retention was assumed', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={['iron']} />);
    const row = screen.getByRole('row', { name: /iron/i });
    expect(within(row).getByTitle(/assumed 100%/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/components/CalcTrace.test.tsx src/ui/components/NutrientTable.test.tsx`
Expected: FAIL — cannot resolve the components.

- [ ] **Step 3: Write the components**

```tsx
// src/ui/components/CalcTrace.tsx
import type { CalcStep } from '../../core/nutrition';

export function CalcTrace({ steps }: { steps: readonly CalcStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="calc-trace">
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`}>
          <span className="calc-trace__label">{s.label}</span>
          <span className="calc-trace__detail">{s.detail}</span>
          <span className="calc-trace__value">{s.value}</span>
          {s.sourceNote !== undefined && <span className="calc-trace__source">{s.sourceNote}</span>}
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// src/ui/components/NutrientTable.tsx
import { NUTRIENT_KEYS, type NutrientKey, type NutrientProfile } from '../../core/types';
import type { MicroTarget } from '../../core/targets';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy', protein: 'Protein', carbs: 'Carbohydrate', fibre: 'Fibre', fat: 'Fat',
  potassium: 'Potassium', iron: 'Iron', magnesium: 'Magnesium',
  zinc: 'Zinc', calcium: 'Calcium', sodium: 'Sodium',
};

const UNITS: Record<NutrientKey, string> = {
  kcal: 'kcal', protein: 'g', carbs: 'g', fibre: 'g', fat: 'g',
  potassium: 'mg', iron: 'mg', magnesium: 'mg', zinc: 'mg', calcium: 'mg', sodium: 'mg',
};

const fmt = (value: number, unit: string): string =>
  `${value.toLocaleString('en-MY', { maximumFractionDigits: unit === 'mg' ? 0 : 1 })}${unit}`;

const pct = (value: number, target: number | undefined, standard: string): string =>
  target === undefined ? `— ${standard}` : `${Math.round((value / target) * 100)}% ${standard}`;

interface Props {
  totals: NutrientProfile;
  targets: Partial<Record<NutrientKey, MicroTarget>>;
  assumedRetentionFor: readonly NutrientKey[];
}

export function NutrientTable({ totals, targets, assumedRetentionFor }: Props) {
  return (
    <table>
      <thead>
        <tr><th scope="col">Nutrient</th><th scope="col">Amount</th><th scope="col">RNI</th><th scope="col">DV</th></tr>
      </thead>
      <tbody>
        {NUTRIENT_KEYS.map((key) => {
          const target = targets[key];
          return (
            <tr key={key}>
              <th scope="row">
                {LABELS[key]}
                {assumedRetentionFor.includes(key) && (
                  <abbr title="Retention assumed 100% — no sourced figure for this nutrient and method"> *</abbr>
                )}
              </th>
              <td>{fmt(totals[key], UNITS[key])}</td>
              <td>{pct(totals[key], target?.rni, 'RNI')}</td>
              <td>{pct(totals[key], target?.dv, 'DV')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/components/CalcTrace.test.tsx src/ui/components/NutrientTable.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/CalcTrace.tsx src/ui/components/NutrientTable.tsx src/ui/components/CalcTrace.test.tsx src/ui/components/NutrientTable.test.tsx
git commit -m "feat: add calculation trace and dual-standard nutrient table"
```

---

## Task 17: Profile screen

**Files:**
- Create: `src/ui/screens/ProfileScreen.tsx`
- Test: `src/ui/screens/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `Profile` from `src/core/types`; `bmr`, `tdee`, `calorieTarget`, `proteinTargetG`, `proteinGPerLb` from `src/core/targets`; `listProfiles`, `saveProfile` from `src/storage/profiles`
- Produces: `<ProfileScreen onSaved={(p: Profile) => void} />`

Fields: name, sex, birth year, height (cm), weight (kg), sessions per week, goal, optional protein g/kg override. Shows the computed BMR, TDEE, calorie target and protein target live, with the protein target in both g/kg and g/lb.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/screens/ProfileScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileScreen } from './ProfileScreen';
import { db } from '../../storage/db';

beforeEach(async () => { await db.profiles.clear(); });

const fill = () => {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ryan' } });
  fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '1996' } });
  fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '175' } });
  fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '75' } });
  fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '4' } });
};

describe('ProfileScreen', () => {
  it('shows the computed targets as the form is filled in', async () => {
    render(<ProfileScreen onSaved={vi.fn()} />);
    fill();
    await waitFor(() => {
      expect(screen.getByTestId('tdee')).toHaveTextContent('2633');
      expect(screen.getByTestId('calorie-target')).toHaveTextContent('2633');
    });
  });

  it('shows the protein target in both g/kg and g/lb', async () => {
    render(<ProfileScreen onSaved={vi.fn()} />);
    fill();
    await waitFor(() => {
      expect(screen.getByTestId('protein-target')).toHaveTextContent('135');
      expect(screen.getByTestId('protein-target')).toHaveTextContent('g/lb');
    });
  });

  it('refuses to save without a name', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects an implausible birth year', async () => {
    render(<ProfileScreen onSaved={vi.fn()} />);
    fill();
    fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/birth year/i);
  });

  it('persists the profile and reports it', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await db.profiles.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/screens/ProfileScreen.test.tsx`
Expected: FAIL — cannot resolve `./ProfileScreen`.

- [ ] **Step 3: Write the screen**

```tsx
// src/ui/screens/ProfileScreen.tsx
import { useMemo, useState } from 'react';
import type { Goal, Profile, Sex } from '../../core/types';
import { bmr, calorieTarget, proteinGPerKgFor, proteinGPerLb, proteinTargetG, tdee } from '../../core/targets';
import { saveProfile } from '../../storage/profiles';

const CURRENT_YEAR = new Date().getUTCFullYear();

interface Draft {
  name: string; sex: Sex; birthYear: string; heightCm: string;
  weightKg: string; sessionsPerWeek: string; goal: Goal; proteinGPerKg: string;
}

const EMPTY: Draft = {
  name: '', sex: 'male', birthYear: '', heightCm: '',
  weightKg: '', sessionsPerWeek: '0', goal: 'maintain', proteinGPerKg: '',
};

function toProfile(d: Draft): Profile {
  return {
    id: crypto.randomUUID(),
    name: d.name.trim(),
    sex: d.sex,
    birthYear: Number(d.birthYear),
    heightCm: Number(d.heightCm),
    weightKg: Number(d.weightKg),
    sessionsPerWeek: Number(d.sessionsPerWeek),
    goal: d.goal,
    ...(d.proteinGPerKg.trim() === '' ? {} : { proteinGPerKg: Number(d.proteinGPerKg) }),
  };
}

function validate(d: Draft): string | null {
  if (d.name.trim() === '') return 'Please enter a name';
  const year = Number(d.birthYear);
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR - 10) {
    return `Please enter a birth year between 1900 and ${CURRENT_YEAR - 10}`;
  }
  if (Number(d.heightCm) < 80 || Number(d.heightCm) > 250) return 'Please enter a height between 80cm and 250cm';
  if (Number(d.weightKg) < 20 || Number(d.weightKg) > 400) return 'Please enter a weight between 20kg and 400kg';
  const sessions = Number(d.sessionsPerWeek);
  if (!Number.isFinite(sessions) || sessions < 0 || sessions > 21) return 'Please enter between 0 and 21 sessions per week';
  return null;
}

export function ProfileScreen({ onSaved }: { onSaved: (p: Profile) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const preview = useMemo(() => {
    if (validate(draft) !== null) return null;
    const p = toProfile(draft);
    const today = new Date();
    return {
      bmr: Math.round(bmr(p, today)),
      tdee: Math.round(tdee(p, today)),
      calories: Math.round(calorieTarget(p, today)),
      proteinG: Math.round(proteinTargetG(p)),
      gPerKg: proteinGPerKgFor(p),
      gPerLb: proteinGPerLb(p),
    };
  }, [draft]);

  const submit = async () => {
    const problem = validate(draft);
    if (problem !== null) { setError(problem); return; }
    setError(null);
    const p = toProfile(draft);
    await saveProfile(p);
    onSaved(p);
  };

  return (
    <section>
      <h2>Profile</h2>

      <label htmlFor="name">Name</label>
      <input id="name" value={draft.name} onChange={(e) => set('name', e.target.value)} />

      <fieldset>
        <legend>Sex (used for the BMR formula)</legend>
        {(['male', 'female'] as const).map((s) => (
          <label key={s}>
            <input type="radio" name="sex" value={s} checked={draft.sex === s} onChange={() => set('sex', s)} />
            {s}
          </label>
        ))}
      </fieldset>

      <label htmlFor="birthYear">Birth year</label>
      <input id="birthYear" type="number" value={draft.birthYear} onChange={(e) => set('birthYear', e.target.value)} />

      <label htmlFor="heightCm">Height (cm)</label>
      <input id="heightCm" type="number" value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} />

      <label htmlFor="weightKg">Weight (kg)</label>
      <input id="weightKg" type="number" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />

      <label htmlFor="sessions">Exercise sessions per week</label>
      <input id="sessions" type="number" min={0} max={21} value={draft.sessionsPerWeek} onChange={(e) => set('sessionsPerWeek', e.target.value)} />

      <label htmlFor="goal">Goal</label>
      <select id="goal" value={draft.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
        <option value="cut">Cut</option>
        <option value="maintain">Maintain</option>
        <option value="bulk">Bulk</option>
      </select>

      <label htmlFor="proteinOverride">Protein target override (g/kg, optional)</label>
      <input id="proteinOverride" type="number" step={0.1} value={draft.proteinGPerKg} onChange={(e) => set('proteinGPerKg', e.target.value)} />

      {preview !== null && (
        <dl>
          <dt>BMR</dt><dd data-testid="bmr">{preview.bmr} kcal</dd>
          <dt>TDEE</dt><dd data-testid="tdee">{preview.tdee} kcal</dd>
          <dt>Daily calorie target</dt><dd data-testid="calorie-target">{preview.calories} kcal</dd>
          <dt>Daily protein target</dt>
          <dd data-testid="protein-target">
            {preview.proteinG} g ({preview.gPerKg.toFixed(1)} g/kg · {preview.gPerLb.toFixed(2)} g/lb)
          </dd>
        </dl>
      )}

      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void submit()}>Save profile</button>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/screens/ProfileScreen.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ProfileScreen.tsx src/ui/screens/ProfileScreen.test.tsx
git commit -m "feat: add profile screen with live BMR, TDEE and protein targets"
```

---

## Task 18: Add-your-own ingredient screen

**Files:**
- Create: `src/ui/screens/AddIngredientScreen.tsx`
- Test: `src/ui/screens/AddIngredientScreen.test.tsx`

**Interfaces:**
- Consumes: `Ingredient`, `CATEGORIES`, `NUTRIENT_KEYS` from `src/core/types`; `zeroNutrients` from `src/core/nutrients`; `saveUserIngredient` from `src/storage/userIngredients`
- Produces: `<AddIngredientScreen initialName={string} onSaved={(i: Ingredient) => void} />`

This is the spec's designed answer to a missing ingredient, which is why it ships in Phase 1 rather than later: USDA will not cover every Malaysian staple, and the calculator must never dead-end.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/screens/AddIngredientScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddIngredientScreen } from './AddIngredientScreen';
import { db } from '../../storage/db';

beforeEach(async () => { await db.userIngredients.clear(); });

describe('AddIngredientScreen', () => {
  it('prefills the name from the failed search', () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/name/i)).toHaveValue('Petai');
  });

  it('saves a user ingredient marked as user-sourced', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^energy/i), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.userIngredients.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.source).toBe('user');
    expect(saved[0]!.per100gRaw.protein).toBe(6);
    expect(saved[0]!.archived).toBe(false);
  });

  it('requires a name', async () => {
    render(<AddIngredientScreen initialName="" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
  });

  it('rejects a negative nutrient value', async () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/negative/i);
  });

  it('defaults unfilled nutrients to zero rather than leaving them undefined', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.per100gRaw.magnesium).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/screens/AddIngredientScreen.test.tsx`
Expected: FAIL — cannot resolve `./AddIngredientScreen`.

- [ ] **Step 3: Write the screen**

```tsx
// src/ui/screens/AddIngredientScreen.tsx
import { useState } from 'react';
import { CATEGORIES, NUTRIENT_KEYS, type Category, type Ingredient, type NutrientKey, type NutrientProfile } from '../../core/types';
import { zeroNutrients } from '../../core/nutrients';
import { saveUserIngredient } from '../../storage/userIngredients';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy (kcal)', protein: 'Protein (g)', carbs: 'Carbohydrate (g)',
  fibre: 'Fibre (g)', fat: 'Fat (g)', potassium: 'Potassium (mg)',
  iron: 'Iron (mg)', magnesium: 'Magnesium (mg)', zinc: 'Zinc (mg)',
  calcium: 'Calcium (mg)', sodium: 'Sodium (mg)',
};

type Entries = Record<NutrientKey, string>;

const emptyEntries = (): Entries => {
  const out = {} as Entries;
  for (const k of NUTRIENT_KEYS) out[k] = '';
  return out;
};

export function AddIngredientScreen({
  initialName, onSaved,
}: { initialName: string; onSaved: (i: Ingredient) => void }) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<Category>('other');
  const [absorbsWater, setAbsorbsWater] = useState(false);
  const [entries, setEntries] = useState<Entries>(emptyEntries);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim() === '') { setError('Please enter a name'); return; }

    const per100gRaw: NutrientProfile = zeroNutrients();
    for (const k of NUTRIENT_KEYS) {
      const raw = entries[k].trim();
      if (raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) { setError(`${LABELS[k]} must be a number`); return; }
      if (value < 0) { setError(`${LABELS[k]} cannot be negative`); return; }
      per100gRaw[k] = value;
    }

    setError(null);
    const ingredient: Ingredient = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category,
      per100gRaw,
      publishedYield: {},
      absorbsWater,
      source: 'user',
      archived: false,
    };
    await saveUserIngredient(ingredient);
    onSaved(ingredient);
  };

  return (
    <section>
      <h2>Add an ingredient</h2>
      <p>Values per 100g raw. Anything you leave blank is recorded as zero.</p>

      <label htmlFor="ing-name">Name</label>
      <input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="ing-category">Category</label>
      <select id="ing-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label>
        <input type="checkbox" checked={absorbsWater} onChange={(e) => setAbsorbsWater(e.target.checked)} />
        Absorbs water when cooked (rice, pasta, dried beans)
      </label>

      {NUTRIENT_KEYS.map((k) => (
        <div key={k}>
          <label htmlFor={`n-${k}`}>{LABELS[k]}</label>
          <input
            id={`n-${k}`}
            type="number"
            step="any"
            value={entries[k]}
            onChange={(e) => setEntries((s) => ({ ...s, [k]: e.target.value }))}
          />
        </div>
      ))}

      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void submit()}>Save ingredient</button>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/screens/AddIngredientScreen.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/AddIngredientScreen.tsx src/ui/screens/AddIngredientScreen.test.tsx
git commit -m "feat: add user ingredient entry so the calculator never dead-ends"
```

---

## Task 19: Calculator screen

**Files:**
- Create: `src/ui/screens/CalcScreen.tsx`, `src/ui/components/MethodCompare.tsx`
- Test: `src/ui/screens/CalcScreen.test.tsx`

**Interfaces:**
- Consumes: `useCatalogue`; `WeightInput`; `CalcTrace`; `NutrientTable`; `computeCooked`, `computeRaw`, `rawFromCooked` from `src/core/nutrition`; `compareMethods` from `src/core/methodCompare`; `microTargets`, `calorieTarget`, `proteinTargetG` from `src/core/targets`; `CATEGORY_YIELD`, `RETENTION`, `rniFor`, `DV_US`
- Produces: `<CalcScreen profile={Profile | null} />`, `<MethodCompare rows={MethodRow[]} />`

Controls: ingredient picker, weight (via `WeightInput`), a raw/cooked selector for what the entered weight *is*, and a cooking method. Shows the resulting weight with its trace, the nutrient table, the share of the day's calories and protein when a profile exists, and the method comparison.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/screens/CalcScreen.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcScreen } from './CalcScreen';
import { db } from '../../storage/db';
import type { Profile } from '../../core/types';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

beforeEach(async () => { await db.userIngredients.clear(); });

const selectChicken = async () => {
  await waitFor(() => expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/ingredient/i), { target: { value: 'chicken-breast' } });
  fireEvent.change(screen.getByLabelText(/^weight/i), { target: { value: '1000' } });
  fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'roasted' } });
};

describe('CalcScreen', () => {
  it('shows the cooked weight for a raw input', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByTestId('result-weight')).toHaveTextContent('750'));
  });

  it('shows the working, including the yield provenance', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByText(/published factor/i)).toBeInTheDocument());
  });

  it('shows the raw weight when the entered weight is cooked', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();
    fireEvent.click(screen.getByRole('radio', { name: /cooked/i }));
    await waitFor(() => expect(screen.getByTestId('result-weight')).toHaveTextContent('1,333'));
  });

  it('shows the share of the daily calorie target when a profile exists', async () => {
    render(<CalcScreen profile={profile} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByTestId('calorie-share')).toHaveTextContent('%'));
  });

  it('omits the daily share when there is no profile', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByTestId('result-weight')).toBeInTheDocument());
    expect(screen.queryByTestId('calorie-share')).not.toBeInTheDocument();
  });

  it('ranks cooking methods by what they retain', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByRole('table', { name: /method comparison/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/screens/CalcScreen.test.tsx`
Expected: FAIL — cannot resolve `./CalcScreen`.

- [ ] **Step 3: Write the method comparison component**

```tsx
// src/ui/components/MethodCompare.tsx
import type { MethodRow } from '../../core/methodCompare';
import type { NutrientKey } from '../../core/types';

const SOURCE_NOTE: Record<MethodRow['yieldSource'], string> = {
  measured: 'your cooks',
  published: 'published',
  categoryDefault: 'rough estimate',
};

export function MethodCompare({ rows, highlight }: { rows: readonly MethodRow[]; highlight: readonly NutrientKey[] }) {
  return (
    <table aria-label="Method comparison">
      <thead>
        <tr>
          <th scope="col">Method</th>
          <th scope="col">Weight kept</th>
          {highlight.map((k) => <th key={k} scope="col">{k}</th>)}
          <th scope="col">Yield source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.method}>
            <th scope="row">{r.method}</th>
            <td>{Math.round(r.weightKeptPct)}%</td>
            {highlight.map((k) => <td key={k}>{Math.round(r.retainedPct[k] ?? 100)}%</td>)}
            <td>{SOURCE_NOTE[r.yieldSource]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Write the calculator screen**

```tsx
// src/ui/screens/CalcScreen.tsx
import { useMemo, useState } from 'react';
import { COOK_METHODS, type CookMethod, type NutrientKey, type Profile } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { computeCooked, rawFromCooked } from '../../core/nutrition';
import { compareMethods } from '../../core/methodCompare';
import { calorieTarget, microTargets, proteinTargetG } from '../../core/targets';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { RETENTION } from '../../data/retentionTable';
import { rniFor } from '../../data/rniMY';
import { DV_US } from '../../data/dvUS';
import { useCatalogue } from '../useCatalogue';
import { WeightInput, type WeightUnit } from '../components/WeightInput';
import { CalcTrace } from '../components/CalcTrace';
import { NutrientTable } from '../components/NutrientTable';
import { MethodCompare } from '../components/MethodCompare';

const HIGHLIGHT: NutrientKey[] = ['potassium', 'iron', 'magnesium'];

export function CalcScreen({ profile }: { profile: Profile | null }) {
  const { catalogue } = useCatalogue();
  const [ingredientId, setIngredientId] = useState('');
  const [weight, setWeight] = useState<Grams>(g(0));
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [entered, setEntered] = useState<'raw' | 'cooked'>('raw');
  const [method, setMethod] = useState<CookMethod>('roasted');

  const ingredient = catalogue.find((i) => i.id === ingredientId) ?? null;

  const result = useMemo(() => {
    if (ingredient === null || weight <= 0) return null;
    const rawG = entered === 'raw'
      ? weight
      : rawFromCooked(ingredient, weight, method, [], CATEGORY_YIELD).rawWeightG;
    const cooked = computeCooked({
      ingredient, rawG, method, samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION,
    });
    return { cooked, shownWeight: entered === 'raw' ? cooked.cookedWeightG : rawG };
  }, [ingredient, weight, entered, method]);

  const rows = useMemo(
    () => (ingredient === null ? [] : compareMethods(ingredient, [], CATEGORY_YIELD, RETENTION, HIGHLIGHT)),
    [ingredient],
  );

  const targets = useMemo(
    () => (profile === null ? {} : microTargets(profile, new Date(), rniFor, DV_US)),
    [profile],
  );

  return (
    <section>
      <h2>Calculator</h2>

      <label htmlFor="ingredient">Ingredient</label>
      <select id="ingredient" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
        <option value="">Choose…</option>
        {catalogue.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      <WeightInput label="Weight" value={weight} unit={unit} onChange={setWeight} onUnitChange={setUnit} />

      <fieldset>
        <legend>This weight is</legend>
        {(['raw', 'cooked'] as const).map((s) => (
          <label key={s}>
            <input type="radio" name="entered" value={s} checked={entered === s} onChange={() => setEntered(s)} />
            {s}
          </label>
        ))}
      </fieldset>

      <label htmlFor="method">Cooking method</label>
      <select id="method" value={method} onChange={(e) => setMethod(e.target.value as CookMethod)}>
        {COOK_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      {result !== null && (
        <>
          <p data-testid="result-weight">
            {result.shownWeight.toLocaleString('en-MY', { maximumFractionDigits: 0 })}g{' '}
            {entered === 'raw' ? 'cooked' : 'raw'}
          </p>

          <CalcTrace steps={result.cooked.steps} />

          <NutrientTable
            totals={result.cooked.totals}
            targets={targets}
            assumedRetentionFor={result.cooked.assumedRetentionFor}
          />

          {profile !== null && (
            <p data-testid="calorie-share">
              {Math.round((result.cooked.totals.kcal / calorieTarget(profile, new Date())) * 100)}% of your daily
              calories · {Math.round((result.cooked.totals.protein / proteinTargetG(profile)) * 100)}% of your protein
            </p>
          )}

          <MethodCompare rows={rows} highlight={HIGHLIGHT} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ui/screens/CalcScreen.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/CalcScreen.tsx src/ui/components/MethodCompare.tsx src/ui/screens/CalcScreen.test.tsx
git commit -m "feat: add calculator screen with trace, nutrients and method ranking"
```

---

## Task 20: App shell, storage warning and PWA

**Files:**
- Create: `src/ui/App.tsx` (replacing the scaffold), `public/manifest.webmanifest`
- Modify: `vite.config.ts`, `src/main.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `CalcScreen`, `ProfileScreen`, `AddIngredientScreen`; `getSettings`, `saveSettings`; `listProfiles`; `isStorageAvailable`
- Produces: `<App />`

Phase 1 ships two working tabs, Calc and Profile. The Today and Kitchen tabs are rendered as disabled placeholders naming the phase that delivers them, so the navigation the spec describes is visible from the start without pretending the screens exist.

The landing tab comes from `Settings.landingTab`, defaulting to `today`; since Today does not exist yet, Phase 1 falls back to Calc when the stored landing tab is unavailable.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/App.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from './App';
import { db } from '../storage/db';
import { saveSettings } from '../storage/settings';

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows all four tabs', async () => {
    render(<App />);
    for (const name of ['Today', 'Kitchen', 'Calc', 'Costs']) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('disables the tabs that arrive in later phases', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeDisabled();
    expect(await screen.findByRole('tab', { name: 'Kitchen' })).toBeDisabled();
    expect(await screen.findByRole('tab', { name: 'Calc' })).toBeEnabled();
  });

  it('prompts for a profile when none exists', async () => {
    render(<App />);
    expect(await screen.findByText(/set up a profile/i)).toBeInTheDocument();
  });

  it('switches to the profile screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));
    expect(await screen.findByLabelText(/birth year/i)).toBeInTheDocument();
  });

  it('opens on the tab stored in settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'calc', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Calc' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Calc when the stored landing tab is not built yet', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'today', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Calc' })).toHaveAttribute('aria-selected', 'true');
  });
});

// `isStorageAvailable` is a named ES-module export, so it must be replaced with
// vi.mock at module level rather than vi.spyOn, which cannot rebind it.
describe('App without storage', () => {
  it('warns when storage is unavailable rather than failing silently', async () => {
    vi.doMock('../storage/db', async () => {
      const actual = await vi.importActual<typeof import('../storage/db')>('../storage/db');
      return { ...actual, isStorageAvailable: async () => false };
    });
    const { App: AppNoStorage } = await import('./App');
    render(<AppNoStorage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/private browsing|storage/i);
    vi.doUnmock('../storage/db');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — `App` does not export the expected shell.

- [ ] **Step 3: Write the app shell**

```tsx
// src/ui/App.tsx
import { useEffect, useState } from 'react';
import type { Profile } from '../core/types';
import { isStorageAvailable } from '../storage/db';
import { listProfiles } from '../storage/profiles';
import { getSettings } from '../storage/settings';
import { CalcScreen } from './screens/CalcScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type Tab = 'today' | 'kitchen' | 'calc' | 'costs' | 'profile';

const TABS: { id: Tab; label: string; phase?: number }[] = [
  { id: 'today', label: 'Today', phase: 3 },
  { id: 'kitchen', label: 'Kitchen', phase: 2 },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs', phase: 4 },
  { id: 'profile', label: 'Profile' },
];

/** Tabs that actually exist in Phase 1. A stored preference for any other tab falls back to Calc. */
const BUILT: readonly Tab[] = ['calc', 'profile'];

export function App() {
  const [tab, setTab] = useState<Tab>('calc');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isStorageAvailable();
      if (cancelled) return;
      setStorageOk(ok);
      if (!ok) return;

      const [settings, profiles] = await Promise.all([getSettings(), listProfiles()]);
      if (cancelled) return;
      setTab(BUILT.includes(settings.landingTab) ? settings.landingTab : 'calc');
      setProfile(profiles[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>IngCalc</h1>
        {profile !== null && <span>{profile.name}</span>}
      </header>

      {!storageOk && (
        <p role="alert">
          This browser will not let the app save anything — private browsing blocks storage.
          You can still use the calculator, but profiles and ingredients you add will be lost
          when you close the tab.
        </p>
      )}

      {storageOk && profile === null && tab === 'calc' && (
        <p>Set up a profile to see what a portion is worth against your daily targets.</p>
      )}

      <main>
        {tab === 'calc' && <CalcScreen profile={profile} />}
        {tab === 'profile' && <ProfileScreen onSaved={(p) => { setProfile(p); setTab('calc'); }} />}
      </main>

      <nav role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            disabled={t.phase !== undefined}
            title={t.phase !== undefined ? `Arrives in Phase ${t.phase}` : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire up the PWA**

```bash
npm install -D vite-plugin-pwa
```

Add to `vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa';

// inside plugins: [...]
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'IngCalc',
    short_name: 'IngCalc',
    description: 'Raw to cooked weights, nutrients and cost per gram of protein',
    theme_color: '#1f2933',
    background_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}),
```

Add `public/icon-192.png` and `public/icon-512.png`. A plain square with the letters "IC" is sufficient for Phase 1.

- [ ] **Step 6: Verify the build and the full suite**

Run: `npm run build && npm test`
Expected: the build succeeds and every test passes.

- [ ] **Step 7: Verify it runs in a browser**

Run: `npm run dev`

Confirm by hand: create a profile, see BMR/TDEE/protein targets appear; switch to Calc; choose chicken breast, enter 1kg, roasted; confirm the cooked weight reads 750g, the trace names "published factor", the nutrient table shows both RNI and DV columns, and the method comparison table is ranked.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add app shell with tab navigation, storage warning and PWA manifest"
```

---

## Phase 1 Definition of Done

- [ ] `npm test` passes, including the golden-value suite with at least 20 cases
- [ ] `npm run build` succeeds and the app installs to a phone home screen
- [ ] At least 60 ingredients, each carrying an FDC `sourceRef`
- [ ] Every displayed derived number states its provenance (measured / published / category default / assumed retention)
- [ ] Micronutrients show both RNI and DV percentages, with `—` where a standard has no figure
- [ ] Rice cooked from raw produces a *higher* cooked weight without triggering a validation error
- [ ] An ingredient missing from the catalogue can be added and used immediately
