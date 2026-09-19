import { describe, it, expect } from 'vitest';
import type { Batch, CookSession, NutrientProfile } from './types';
import { NUTRIENT_KEYS } from './types';
import { g, myr } from './units';
import {
  applyEat, batchState, cookedRawTotalG, perPortion, portionsRemaining, portionWeightG, portionsToGrams, rawRemainingG, rescaleCookedRemaining, sessionsOf, validateCook, validateEat, validateRawUsedEdit, validateRawWeightEdit, type CookDraft,
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
