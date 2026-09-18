import type { Grams, MYR } from './units';

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'carbs', 'fibre', 'fat',
  'potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const MICRONUTRIENT_KEYS = [
  'potassium', 'iron', 'magnesium', 'zinc', 'calcium', 'sodium',
] as const;
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

/** 'YYYY-MM-DD'. Local calendar date, not an instant: which day you shopped. */
export type IsoDate = string;

export interface Purchase {
  pricePaidMYR: MYR;
  location: string;
  date: IsoDate;
}

/**
 * One purchase, household-level: you shop once for the house but eat as an
 * individual.
 *
 * There is deliberately no `rawRemainingG` field. Cook sessions are an event
 * log of raw consumption, so the remainder is always recoverable from them —
 * storing it as well would be a second source of truth that editing could put
 * out of step with the first. See `rawRemainingG()` in `./batch`.
 */
export interface Batch {
  id: string;
  ingredientId: string;
  rawWeightG: Grams;
  purchase: Purchase;
  createdAt: number;
}

/**
 * One cooking event, and simultaneously one yield observation: it records the
 * ingredient (through its batch), the method, the raw weight in and the cooked
 * weight out. That is why Phase 2 needs no separate calibration table.
 */
export interface CookSession {
  id: string;
  batchId: string;
  method: CookMethod;
  rawUsedG: Grams;
  /** Measured by the user on a scale, never derived from a yield factor. */
  cookedWeightG: Grams;
  /**
   * Authoritative remaining quantity. Stored rather than derived because
   * eating writes no record until Phase 3 introduces meals.
   */
  cookedRemainingG: Grams;
  cookedAt: IsoDate;
  portionCount: number;
  /** The day you forgot to drain it: kept, but excluded from the yield mean. */
  excludeFromCalibration: boolean;
}

export interface YieldSample {
  ingredientId: string;
  method: CookMethod;
  rawUsedG: Grams;
  cookedWeightG: Grams;
  excludeFromCalibration: boolean;
}

/**
 * One line of a calculation shown to the user.
 *
 * Both the cooking engine and the profile targets explain themselves with these,
 * so it lives in the shared vocabulary rather than in either one.
 */
export interface CalcStep {
  label: string;
  detail: string;
  value: string;
  /** Where the number came from, shown to the user verbatim. */
  sourceNote?: string;
}
