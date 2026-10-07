import { describe, it, expect } from 'vitest';
import { knownCount, offToFood } from './openFoodFacts';

describe('offToFood', () => {
  it('converts a product to per-100 g figures in the app\'s units', () => {
    const f = offToFood({
      code: '9556001234567', product_name: 'Oat Crackers', brands: 'Munchy\'s, Other', quantity: '178 g',
      nutriments: {
        'energy-kcal_100g': 452, proteins_100g: 8.1, carbohydrates_100g: 68, fiber_100g: 6.2, fat_100g: 16,
        sodium_100g: 0.38, iron_100g: 0.0024, calcium_100g: '0.05',
      },
    });
    expect(f).toEqual({
      code: '9556001234567', name: 'Oat Crackers', brand: 'Munchy\'s', quantity: '178 g', perMl: false,
      values: { kcal: 452, protein: 8.1, carbs: 68, fibre: 6.2, fat: 16, sodium: 380, iron: 2.4, calcium: 50 },
    });
  });

  it('leaves out what the product does not list, so it is saved as not known', () => {
    const f = offToFood({ code: '1', product_name: 'Teh', nutriments: { proteins_100g: 1 } })!;
    expect(f.values).toEqual({ protein: 1 });
    expect(knownCount(f)).toBe(1);
  });

  it('converts kJ when kcal is missing, and sodium from salt', () => {
    const f = offToFood({ code: '1', product_name: 'x', nutriments: { energy_100g: 1046, salt_100g: 1.2 } })!;
    expect(f.values).toEqual({ kcal: 250, sodium: 480 });
  });

  it('marks a drink measured per 100 ml', () => {
    expect(offToFood({ code: '1', product_name: 'Milo', quantity: '240 ml' })!.perMl).toBe(true);
    expect(offToFood({ code: '1', product_name: 'Milk', nutrition_data_per: '100ml' })!.perMl).toBe(true);
  });

  it('ignores products with no name or barcode, and nonsense values', () => {
    expect(offToFood({ code: '', product_name: 'x' })).toBeNull();
    expect(offToFood({ code: '1', product_name: ' ' })).toBeNull();
    expect(offToFood({ code: '1', product_name: 'x', nutriments: { fat_100g: -3, proteins_100g: 'abc' } })!.values).toEqual({});
  });
});
