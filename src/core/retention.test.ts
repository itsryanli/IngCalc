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
