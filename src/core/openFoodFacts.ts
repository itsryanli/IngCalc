import { NUTRIENT_KEYS, type NutrientKey } from './types';

/**
 * Turns an Open Food Facts product into the app's per-100 g figures. Open Food
 * Facts normalises every nutrient to per 100 g (or per 100 ml for drinks) in
 * its `*_100g` fields, with minerals in grams; this converts them to the app's
 * units and leaves out anything the product does not list, so it is saved as
 * "not known" rather than a false zero.
 */

/** The parts of an Open Food Facts product this app reads. */
export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  nutrition_data_per?: string;
  nutriments?: Record<string, unknown>;
}

export interface OffFood {
  /** The barcode, which identifies the product on Open Food Facts. */
  code: string;
  name: string;
  brand: string;
  quantity: string;
  /** Per 100 g, in the app's units. Only what the product lists. */
  values: Partial<Record<NutrientKey, number>>;
  /** True when the figures are per 100 ml: a drink. */
  perMl: boolean;
}

type Unit = 'kcal' | 'g' | 'mg';

// Field, and the unit Open Food Facts stores it in.
const FIELDS: Record<Exclude<NutrientKey, 'kcal'>, [string, Unit]> = {
  protein: ['proteins_100g', 'g'],
  carbs: ['carbohydrates_100g', 'g'],
  fibre: ['fiber_100g', 'g'],
  fat: ['fat_100g', 'g'],
  potassium: ['potassium_100g', 'g'],
  iron: ['iron_100g', 'g'],
  magnesium: ['magnesium_100g', 'g'],
  zinc: ['zinc_100g', 'g'],
  calcium: ['calcium_100g', 'g'],
  sodium: ['sodium_100g', 'g'],
};

const MG_TARGET: readonly NutrientKey[] = ['potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium'];
const KJ_PER_KCAL = 4.184;
/** 1 g of salt is 0.4 g of sodium. */
const SODIUM_MG_PER_SALT_G = 400;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

export function offToFood(p: OffProduct): OffFood | null {
  const code = (p.code ?? '').trim();
  const name = (p.product_name ?? '').trim();
  if (code === '' || name === '') return null;
  const n = p.nutriments ?? {};

  const values: Partial<Record<NutrientKey, number>> = {};
  // Prefer kcal as printed; `energy_100g` is always kJ.
  const kcal = num(n['energy-kcal_100g']);
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  if (kcal !== undefined) values.kcal = round(kcal, 0);
  else if (kj !== undefined) values.kcal = round(kj / KJ_PER_KCAL, 0);

  for (const [key, [field, unit]] of Object.entries(FIELDS) as [Exclude<NutrientKey, 'kcal'>, [string, Unit]][]) {
    const v = num(n[field]);
    if (v === undefined) continue;
    values[key] = round(MG_TARGET.includes(key) && unit === 'g' ? v * 1000 : v);
  }
  if (values.sodium === undefined) {
    const salt = num(n['salt_100g']);
    if (salt !== undefined) values.sodium = round(salt * SODIUM_MG_PER_SALT_G);
  }

  return {
    code,
    name,
    brand: (p.brands ?? '').split(',')[0]!.trim(),
    quantity: (p.quantity ?? '').trim(),
    values,
    perMl: /ml/i.test(p.nutrition_data_per ?? '') || /\d\s*(ml|l)\b/i.test(p.quantity ?? ''),
  };
}

/** How many of the app's nutrients a food lists: a food with none is shown but cannot be used. */
export const knownCount = (f: OffFood): number => NUTRIENT_KEYS.filter((k) => f.values[k] !== undefined).length;
