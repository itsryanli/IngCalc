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
    cookedAt: '2026-09-19', portionCount: 2,
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
