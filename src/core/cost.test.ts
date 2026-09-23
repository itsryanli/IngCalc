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
  cookedWeightG: g(284), cookedAt: '2026-09-19',
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
    // attributablePriceMYR: RM20 * (400/1000) = RM8.
    // proteinG: (400/100) * 23 = 92g raw protein.
    // meat/roasted protein retention (MACROS_DRIP.protein) = 0.98 -> 92 * 0.98 = 90.16g.
    // value: 90.16 / 8 = 11.27.
    // A > 10 / < 11.5 range previously passed for ANY retention factor from
    // roughly 0.87 to 1.0 — it pinned "retention was applied" but not "the
    // right factor for protein specifically".
    const value = proteinPerMYRRetained(batch(), chicken, [session()], RETENTION)!;
    expect(value).toBeCloseTo(11.27, 10);
  });

  it('is null before anything has been cooked', () => {
    expect(proteinPerMYRRetained(batch(), chicken, [], RETENTION)).toBeNull();
  });

  it('is null for a gift', () => {
    const free = batch({ purchase: { ...batch().purchase, pricePaidMYR: myr(0) } });
    expect(proteinPerMYRRetained(free, chicken, [session()], RETENTION)).toBeNull();
  });
});
