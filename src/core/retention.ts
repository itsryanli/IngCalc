import { NOT_COOKED, type Category, type CookMethod, type NutrientKey } from './types';

export type RetentionLookup = Partial<
  Record<Category, Partial<Record<CookMethod, Partial<Record<NutrientKey, number>>>>>
>;

export interface Retention {
  factor: number;
  /** True when no sourced figure exists and full retention was assumed. */
  assumed: boolean;
}

export function retentionFor(
  table: RetentionLookup,
  category: Category,
  method: CookMethod,
  nutrient: NutrientKey,
): Retention {
  // Nothing is lost from food that is not cooked: a fact, not an assumption.
  if (method === NOT_COOKED) return { factor: 1, assumed: false };
  const value = table[category]?.[method]?.[nutrient];
  return value === undefined ? { factor: 1, assumed: true } : { factor: value, assumed: false };
}
