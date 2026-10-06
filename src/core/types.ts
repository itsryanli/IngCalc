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

/**
 * 'asIs' is "not cooked": fruit, yogurt, bread, crackers. It is a method rather
 * than a separate path so every form, backup and export handles it for free;
 * the yield and retention lookups short-circuit it to exactly 1.
 */
export const COOK_METHODS = [
  'asIs', 'boiled', 'steamed', 'panFried', 'stirFried', 'deepFried', 'roasted', 'grilled',
] as const;
export type CookMethod = (typeof COOK_METHODS)[number];
export const NOT_COOKED = 'asIs' satisfies CookMethod;
/** The methods that actually apply heat: the ones yield tables and comparisons cover. */
export type HeatMethod = Exclude<CookMethod, typeof NOT_COOKED>;
export const HEAT_METHODS = COOK_METHODS.filter((m): m is HeatMethod => m !== NOT_COOKED);

export interface Ingredient {
  id: string;
  name: string;
  category: Category;
  per100gRaw: NutrientProfile;
  publishedYield: Partial<Record<CookMethod, number>>;
  /** Rice, pasta and dried legumes absorb water: a yield above 1 is correct, not an error. */
  absorbsWater: boolean;
  /** The method forms start on for this ingredient, e.g. 'asIs' for crackers. */
  defaultMethod?: CookMethod;
  /**
   * Nutrients nobody knows for this ingredient, e.g. the minerals a nutrition
   * label leaves out. Stored as 0 in `per100gRaw` so every sum still works; this
   * list is what lets the app say "not known" or "at least" instead of a false 0.
   */
  unknownNutrients?: NutrientKey[];
  source: 'usda' | 'user';
  sourceRef?: string;
  archived: boolean;
}

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
export const GOALS = ['cut', 'maintain', 'bulk'] as const;
export type Goal = (typeof GOALS)[number];

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
  /**
   * Shared by every item logged in one shopping trip, so the trip can be read
   * back as one receipt (for example by a budget export). Absent on purchases
   * logged before trips existed.
   */
  tripId?: string;
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
 *
 * There is deliberately no `cookedRemainingG` field. Meal entries are an event
 * log of consumption, so the remainder is always recoverable from them —
 * storing it too would be a second source of truth that editing could put out
 * of step. Phase 2 did store it, correctly, because eating wrote no record
 * then. See `cookedRemainingG()` in `./batch`.
 */
export interface CookSession {
  id: string;
  batchId: string;
  method: CookMethod;
  rawUsedG: Grams;
  /** Measured by the user on a scale, never derived from a yield factor. */
  cookedWeightG: Grams;
  cookedAt: IsoDate;
  portionCount: number;
  /** The day you forgot to drain it: kept, but excluded from the yield mean. */
  excludeFromCalibration: boolean;
}

/**
 * A population-table target for one micronutrient. Lives here rather than in
 * `targets.ts` because `DayLog` embeds it, and `targets.ts` already imports
 * from this module — the other direction would be a cycle.
 */
export interface MicroTarget {
  rni?: number;
  dv?: number;
}

export const MEAL_LABEL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealLabel = (typeof MEAL_LABEL_KEYS)[number];

interface MealEntryBase {
  id: string;
  profileId: string;
  /** Local calendar date. Built with `todayIso`, never `toISOString()`. */
  date: IsoDate;
  label: MealLabel;
  /** Orders entries within a label. */
  createdAt: number;
}

/**
 * The part of an entry a form produces, before it is given an id and a day.
 * Split out so `EntryDraft` and `MealEntry` cannot drift: `Omit` does not
 * distribute over a discriminated union, so composing is the only safe way.
 */
export type MealEntryFields =
  | { kind: 'portion'; cookSessionId: string; portions: number }
  | { kind: 'weight'; cookSessionId: string; grams: Grams }
  | { kind: 'ingredient'; ingredientId: string; method: CookMethod; cookedG: Grams }
  /** `name`, not `label` — `label` is already the meal slot on the base. */
  | { kind: 'quick'; name: string; kcal: number; proteinG?: number };

export type MealEntry = MealEntryBase & MealEntryFields;

export interface DayLogTargets {
  kcal: number;
  proteinG: number;
  micros: Partial<Record<NutrientKey, MicroTarget>>;
}

/**
 * The targets frozen at the moment a day's first entry was written.
 *
 * Without this, editing a profile's weight silently re-reads the entire
 * history: last Tuesday's "78% of target" would start meaning something else.
 */
export interface DayLog {
  /** `${profileId}:${date}` — a natural key, so a duplicate row is impossible. */
  id: string;
  profileId: string;
  date: IsoDate;
  targets: DayLogTargets;
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

export const LANDING_TABS = ['log', 'kitchen', 'calc'] as const;
export const WEIGHT_UNITS = ['g', 'kg'] as const;

/**
 * Lives in `core/` (not beside the Dexie table) because a backup file carries
 * the settings row, and the backup validator is pure.
 */
/**
 * People who eat together, such as a family. A group lets one meal be logged
 * for every member at once and the day be seen side by side. It owns nothing:
 * each member's entries and targets stay their own.
 */
export interface ProfileGroup {
  id: string;
  name: string;
  /** Profile ids, at least one, no repeats. */
  memberIds: string[];
}

export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: (typeof LANDING_TABS)[number];
  defaultWeightUnit: (typeof WEIGHT_UNITS)[number];
  /** When a backup file was last downloaded (ms since epoch). Absent until the first one. */
  lastBackupAt?: number;
}
