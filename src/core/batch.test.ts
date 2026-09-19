import { describe, it, expect } from 'vitest';
import type { Batch, CookSession, MealEntry, NutrientProfile } from './types';
import { NUTRIENT_KEYS } from './types';
import { g, myr } from './units';
import {
  batchState, consumedFromSession, consumedFromSessionAt, cookedRawTotalG, cookedRemainingG, entrySessionGrams, isSessionEntry, perPortion, portionsRemaining, portionWeightG, portionsToGrams, rawRemainingG, sessionsOf, validateCook, validateCookEdit, validateRawUsedEdit, validateRawWeightEdit, type CookDraft,
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
  cookedAt: '2026-09-19',
  portionCount: 2,
  excludeFromCalibration: false,
  ...over,
});

/**
 * A weighed meal entry against session `s1`. Partly eaten cooks used to be set
 * up by lowering `cookedRemainingG`; the remainder is derived now, so the
 * entries are the setup.
 */
const eaten = (grams: number, over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'weight', cookSessionId: 's1', grams: g(grams), ...over,
} as MealEntry);

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
    expect(batchState(batch(), [], [])).toBe('raw');
  });

  it('is partiallyCooked while raw weight is left', () => {
    expect(batchState(batch(), [session({ rawUsedG: g(400) })], [])).toBe('partiallyCooked');
  });

  it('is cooked once all the raw is used but food remains', () => {
    const s = session({ rawUsedG: g(1000), cookedWeightG: g(750) });
    expect(batchState(batch(), [s], [])).toBe('cooked');
  });

  it('is finished when all the raw is used and nothing is left to eat', () => {
    const s = session({ rawUsedG: g(1000), cookedWeightG: g(750) });
    expect(batchState(batch(), [s], [eaten(750)])).toBe('finished');
  });

  it('stays partiallyCooked when raw is left even if every cooked portion is gone', () => {
    const s = session({ rawUsedG: g(400) });
    expect(batchState(batch(), [s], [eaten(300)])).toBe('partiallyCooked');
  });

  it('treats a sub-epsilon remainder as fully cooked, not as a sliver left over', () => {
    const s = session({ rawUsedG: g(999.999), cookedWeightG: g(750) });
    expect(batchState(batch(), [s], [])).toBe('cooked');
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
    const s = session({ cookedWeightG: g(296), portionCount: 2 });
    expect(portionsRemaining(s, [eaten(100)])).toBeCloseTo(1.324, 3);
  });

  it('is zero for a session that produced nothing', () => {
    expect(portionsRemaining(session({ cookedWeightG: g(0) }), [])).toBe(0);
  });
});

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

/* ==========================================================================
   perPortion — the calculator's split view
   ========================================================================== */

/** Distinct values per key, so a transposed or copied field cannot pass. */
const wholeCook = (): NutrientProfile => ({
  kcal: 1240, protein: 168, carbs: 44, fibre: 8, fat: 26,
  potassium: 1520, iron: 6.4, magnesium: 220, zinc: 9.6, calcium: 120, sodium: 480,
});

describe('perPortion', () => {
  it('divides every nutrient by the portion count', () => {
    const whole = wholeCook();
    const one = perPortion(whole, 4);
    for (const key of NUTRIENT_KEYS) {
      expect(one[key]).toBeCloseTo(whole[key] / 4, 10);
    }
  });

  it('leaves a single portion equal to the whole cook', () => {
    expect(perPortion(wholeCook(), 1)).toEqual(wholeCook());
  });

  it('does not mutate the totals it was given', () => {
    const whole = wholeCook();
    perPortion(whole, 4);
    expect(whole).toEqual(wholeCook());
  });

  it('rejects a portion count below one', () => {
    expect(() => perPortion(wholeCook(), 0)).toThrow(RangeError);
  });

  it('rejects a portion count that is not a finite number', () => {
    expect(() => perPortion(wholeCook(), Number.NaN)).toThrow(RangeError);
  });
});

/* ==========================================================================
   Entry-aware quantities — deriving a cook's remainder from meal entries
   ========================================================================== */

// 284g cooked in 4 portions = 71g per portion.
const cook = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false, ...over,
});

const mealEntry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

describe('isSessionEntry', () => {
  it('is true for portion and weight entries', () => {
    expect(isSessionEntry(mealEntry())).toBe(true);
    expect(isSessionEntry(mealEntry({ kind: 'weight', cookSessionId: 's1', grams: g(50) }))).toBe(true);
  });

  it('is false for ingredient and quick entries', () => {
    const ing = mealEntry({ kind: 'ingredient', ingredientId: 'i1', method: 'boiled', cookedG: g(100) });
    const quick = mealEntry({ kind: 'quick', name: 'Teh tarik', kcal: 180 });
    expect(isSessionEntry(ing)).toBe(false);
    expect(isSessionEntry(quick)).toBe(false);
  });
});

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
