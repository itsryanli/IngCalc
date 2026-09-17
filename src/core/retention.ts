import type { Category, CookMethod, NutrientKey } from './types';

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
  const value = table[category]?.[method]?.[nutrient];
  return value === undefined ? { factor: 1, assumed: true } : { factor: value, assumed: false };
}
