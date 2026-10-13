import { describe, it, expect } from 'vitest';
import { USDA_FOODS } from './usdaFoods';
import { CURATED, INGREDIENTS, findIngredient } from './ingredients';

describe('USDA_FOODS', () => {
  it('adds well over a thousand raw and as-sold foods, after the curated set', () => {
    expect(USDA_FOODS.length).toBeGreaterThan(1000);
    expect(INGREDIENTS.slice(0, CURATED.length)).toEqual(CURATED);
  });

  it("includes ordinary spinach, with USDA's figures and its FDC id", () => {
    const spinach = findIngredient('fdc-168462')!;
    expect(spinach).toMatchObject({ name: 'Spinach, raw', category: 'vegetable', sourceRef: 'FDC 168462', source: 'usda' });
    expect(spinach.per100gRaw).toMatchObject({ kcal: 23, protein: 2.86, iron: 2.71, potassium: 558 });
  });

  it('only takes raw or as-sold forms, never cooked ones the app would cook twice', () => {
    for (const f of USDA_FOODS) {
      expect(f.name, f.id).not.toMatch(/\b(boiled|roasted|fried|braised|broiled|grilled|stewed|steamed|microwaved|cooked)\b/i);
    }
  });

  it('keeps what USDA did not measure as not known, never as a false zero', () => {
    const withUnknowns = USDA_FOODS.filter((f) => (f.unknownNutrients ?? []).length > 0);
    expect(withUnknowns.length).toBeGreaterThan(0);
    for (const f of withUnknowns) {
      for (const k of f.unknownNutrients!) expect(f.per100gRaw[k], `${f.id}.${k}`).toBe(0);
    }
  });

  it('starts fruit, dairy, oils and spices on not cooked, and marks dry grains and beans as absorbing water', () => {
    const byName = (n: string) => USDA_FOODS.find((f) => f.name === n)!;
    expect(byName('Bananas, raw').defaultMethod).toBe('asIs');
    expect(byName('Cheese, cheddar').defaultMethod).toBe('asIs');
    expect(byName('Spinach, raw').defaultMethod).toBeUndefined();
    expect(byName('Rice, white, glutinous, unenriched, uncooked').absorbsWater).toBe(true);
    expect(byName('Lentils, raw').absorbsWater).toBe(false);
    expect(byName('Beans, kidney, all types, mature seeds, raw').absorbsWater).toBe(true);
  });

  it("leaves out branded products and USDA's bookkeeping notes", () => {
    for (const f of USDA_FOODS) {
      expect(f.name, f.id).not.toMatch(/Food Distribution Program|\bMORI-NU\b|Vitasoy/);
    }
  });
});
