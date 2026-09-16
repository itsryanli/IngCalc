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
