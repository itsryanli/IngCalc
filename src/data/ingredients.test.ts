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
    // The water-absorbing ceiling was raised from 3.5 to 8.0 by Task 9's
    // golden-value suite: real USDA FoodData Central raw/cooked pairs show
    // cooked oatmeal (rolled-oats, boiled) implies a ~6.65x yield — porridge
    // is USDA-reference-level watery (~70 kcal/100g cooked), which the
    // original 3.5 ceiling (calibrated on rice at ~2.6-3x) excluded. 8.0
    // still catches the error this check actually exists to catch (a
    // decimal-place slip, e.g. 26 instead of 2.6) while admitting porridge.
    // Do not re-tighten this without equivalent FDC evidence.
    for (const ing of INGREDIENTS) {
      for (const [method, factor] of Object.entries(ing.publishedYield)) {
        expect(factor, `${ing.id}.${method}`).toBeGreaterThan(0.3);
        expect(factor, `${ing.id}.${method}`).toBeLessThanOrEqual(ing.absorbsWater ? 8.0 : 1.1);
      }
    }
  });

  it('finds an ingredient by id and returns undefined for an unknown one', () => {
    expect(findIngredient('chicken-breast')?.name).toBeTruthy();
    expect(findIngredient('nope')).toBeUndefined();
  });
});
