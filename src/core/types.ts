import type { Grams } from './units';

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'carbs', 'fibre', 'fat',
  'potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientProfile = Record<NutrientKey, number>;

export const CATEGORIES = [
  'vegetable', 'meat', 'seafood', 'fruit', 'grain',
  'legume', 'dairy', 'egg', 'nut', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const COOK_METHODS = [
  'boiled', 'steamed', 'panFried', 'stirFried', 'deepFried', 'roasted', 'grilled',
] as const;
export type CookMethod = (typeof COOK_METHODS)[number];

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  per100gRaw: NutrientProfile;
  publishedYield: Partial<Record<CookMethod, number>>;
  /** Rice, pasta and dried legumes absorb water: a yield above 1 is correct, not an error. */
  absorbsWater: boolean;
  source: 'usda' | 'user';
  sourceRef?: string;
  archived: boolean;
}

export type Sex = 'male' | 'female';
export type Goal = 'cut' | 'maintain' | 'bulk';

export interface Profile {
  id: string;
  name: string;
  /** An input to the Mifflin-St Jeor formula, which has two variants. */
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  sessionsPerWeek: number;
  goal: Goal;
  proteinGPerKg?: number;
}

export interface YieldSample {
  ingredientId: string;
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
  excludeFromCalibration: boolean;
}
