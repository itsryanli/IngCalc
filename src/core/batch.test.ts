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
